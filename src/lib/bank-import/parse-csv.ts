import { parse } from "csv-parse/sync";

export type BankCsvFormat = "simple" | "ipko-biznes";

export type ParsedBankRow = {
  bookingDate: Date;
  valueDate?: Date;
  /** Kwota w groszach (ujemna = wydatek). */
  amountGrosze: number;
  description: string;
  counterpartyName?: string;
  counterpartyAccount?: string;
  /** Z wiersza CSV (np. iPKO); jeśli brak — użyć domyślnej z importu. */
  currency?: string;
};

export type ParseBankStatementResult = {
  rows: ParsedBankRow[];
  errors: { line: number; message: string }[];
  format: BankCsvFormat;
};

function normKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Klucze segmentów „Dane operacji” (np. Tytuł z ł). */
function normSegmentKey(s: string): string {
  return normKey(s).replace(/\u0142/g, "l");
}

function normalizeHeaderCell(h: string): string {
  return normKey(h.replace(/^\uFEFF/, "").trim());
}

/** iPKO Biznes: pierwszy wiersz musi zawierać te kolumny (po normalizacji nagłówków). */
function isIpkoBiznesFormat(headers: string[]): boolean {
  const n = headers.map(normalizeHeaderCell);
  const need = ["data operacji", "dane operacji", "kwota", "typ operacji"];
  return need.every((key) => n.includes(key));
}

/**
 * Mapowanie kolumn iPKO (kolejność typowa; duplikat „Waluta”: pierwsza = waluta kwoty, druga ignorowana).
 */
function buildIpkoColumnMap(headers: string[]): Map<number, string> | null {
  if (!isIpkoBiznesFormat(headers)) return null;
  const map = new Map<number, string>();
  let walutaSeq = 0;
  headers.forEach((raw, i) => {
    const k = normalizeHeaderCell(raw);
    if (k === "data operacji") map.set(i, "date");
    else if (k === "data waluty") map.set(i, "valueDate");
    else if (k === "dane operacji") map.set(i, "daneOperacji");
    else if (k === "typ operacji") map.set(i, "typOperacji");
    else if (k === "kwota") map.set(i, "amount");
    else if (k === "saldo po operacji" || (k.includes("saldo") && k.includes("operacji"))) map.set(i, "balance");
    else if (k === "waluta") {
      if (walutaSeq === 0) map.set(i, "currency");
      walutaSeq += 1;
    }
  });
  if (![...map.values()].includes("date") || ![...map.values()].includes("amount")) return null;
  return map;
}

/** Polski / angielski nagłówek (prosty CSV) → kanoniczna nazwa pola. */
function mapHeader(h: string): string | null {
  const k = normKey(h);
  if (!k) return null;
  if (k === "data operacji" || /^data\s+operacji\b/.test(k)) return "date";
  if (k === "data waluty" || /^data\s+waluty\b/.test(k)) return "valueDate";
  if (k === "dane operacji" || /^dane\s+operacji\b/.test(k)) return "daneOperacji";
  if (k === "typ operacji" || /^typ\s+operacji\b/.test(k)) return "typOperacji";
  if (/^(data|date|booking|data_ksiegowania|data_transakcji|data ksiegowania|data transakcji)$/.test(k)) return "date";
  if (/^(data_waluty|value|value_date|data waluty)$/.test(k)) return "valueDate";
  if (/^(opis|description|tytul|tytuł|nazwa|details|informacje)$/.test(k)) return "description";
  if (/^(kwota|amount|amount_pln|obrot|wartosc|wartość)$/.test(k)) return "amount";
  if (/^(saldo|balance|stan)$/.test(k) || k.includes("saldo")) return "balance";
  if (/^(kontrahent|counterparty|odbiorca|nadawca|nazwa kontrahenta)$/.test(k)) return "counterparty";
  if (/^(rachunek|account|nr rachunku|iban)$/.test(k)) return "account";
  if (k === "waluta") return "currency";
  return null;
}

function buildSimpleColumnMap(headers: string[]): Map<number, string> {
  const map = new Map<number, string>();
  headers.forEach((h, i) => {
    const m = mapHeader(h);
    if (m) map.set(i, m);
  });
  return map;
}

function parsePolishNumber(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function toGrosze(pln: number): number {
  return Math.round(pln * 100);
}

function parseDateCell(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T12:00:00.000Z`);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

type SegmentMap = {
  tytul?: string;
  lokalizacja?: string;
  nazwaKontrahenta?: string;
  rachunekKontrahenta?: string;
  numerKarty?: string;
};

/** Rozbija „Dane operacji” na segmenty key: value (separator |). */
function parseDaneOperacjiSegments(raw: string): SegmentMap {
  const out: SegmentMap = {};
  const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const key = normSegmentKey(part.slice(0, idx));
    const val = part.slice(idx + 1).trim();
    if (!val) continue;
    if (key.startsWith("tytul")) out.tytul = val;
    else if (key.startsWith("lokalizacja")) out.lokalizacja = val;
    else if (key.includes("nazwa") && key.includes("kontrahent")) out.nazwaKontrahenta = val;
    else if (key.includes("rachunek") && key.includes("kontrahent")) out.rachunekKontrahenta = val;
    else if (key.includes("numer") && key.includes("kart")) out.numerKarty = val;
  }
  return out;
}

/**
 * Heurystyka opisu i pól kontrahenta dla iPKO (wg wymagań).
 */
function buildIpkoDescriptionAndParties(
  daneOperacji: string,
  typOperacji: string | undefined,
): { description: string; counterpartyName?: string; counterpartyAccount?: string } {
  const raw = daneOperacji.trim();
  const seg = parseDaneOperacjiSegments(raw);
  const typ = (typOperacji ?? "").trim();

  let description = "";
  if (seg.tytul) description = seg.tytul;
  if (seg.lokalizacja) {
    description = description ? `${description} — ${seg.lokalizacja}` : seg.lokalizacja;
  }
  if (!description && seg.nazwaKontrahenta) {
    description = seg.nazwaKontrahenta.split(",")[0]?.trim() ?? seg.nazwaKontrahenta;
  }
  if (!description && typ) {
    description = typ;
  }
  if (!description) {
    description = raw || "(brak opisu)";
  }

  const counterpartyAccount = seg.rachunekKontrahenta?.replace(/\s+/g, " ").trim();
  const counterpartyName = seg.nazwaKontrahenta?.split(",")[0]?.trim();

  return {
    description: description.slice(0, 4000),
    counterpartyName: counterpartyName ? counterpartyName.slice(0, 500) : undefined,
    counterpartyAccount: counterpartyAccount ? counterpartyAccount.slice(0, 120) : undefined,
  };
}

/**
 * Prosty CSV (nagłówki lub 3 kolumny) oraz eksport iPKO Biznes (wykrywany po nagłówkach).
 * Parser: csv-parse — poprawne cudzysłowy i przecinki w polach.
 */
export function parseBankStatementCsv(text: string): ParseBankStatementResult {
  const errors: { line: number; message: string }[] = [];
  const bomStripped = text.replace(/^\uFEFF/, "");
  if (bomStripped.trim() === "") {
    return { rows: [], errors: [{ line: 0, message: "Pusty plik" }], format: "simple" };
  }

  let records: string[][];
  try {
    records = parse(bomStripped, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: true,
    }) as string[][];
  } catch {
    return { rows: [], errors: [{ line: 0, message: "Nie udało się sparsować CSV" }], format: "simple" };
  }

  if (records.length === 0) {
    return { rows: [], errors: [{ line: 0, message: "Brak wierszy danych" }], format: "simple" };
  }

  const first = records[0] ?? [];
  const headerCells = first.map((c) => String(c ?? ""));
  const ipkoMap = buildIpkoColumnMap(headerCells);

  let startIdx = 0;
  let colMap: Map<number, string>;
  let format: BankCsvFormat = "simple";

  if (ipkoMap) {
    colMap = ipkoMap;
    startIdx = 1;
    format = "ipko-biznes";
  } else {
    const firstCell = String(first[0] ?? "").trim();
    const firstLooksLikeHeader =
      first.length >= 3 &&
      (parseDateCell(firstCell) === null || Number.isNaN(parsePolishNumber(first[2] ?? "") ?? NaN)) &&
      mapHeader(firstCell) !== null;

    if (firstLooksLikeHeader) {
      colMap = buildSimpleColumnMap(headerCells);
      startIdx = 1;
      const hasDate = [...colMap.values()].includes("date");
      const hasAmount = [...colMap.values()].includes("amount");
      if (!hasDate || !hasAmount) {
        return {
          rows: [],
          errors: [
            {
              line: 1,
              message:
                "Nie znaleziono kolumn „data” i „kwota” — ustaw rozpoznawalne nagłówki albo użyj 3 kolumn: data, opis, kwota",
            },
          ],
          format: "simple",
        };
      }
    } else {
      colMap = new Map([
        [0, "date"],
        [1, "description"],
        [2, "amount"],
      ]);
    }
  }

  const rows: ParsedBankRow[] = [];

  for (let r = startIdx; r < records.length; r++) {
    const lineNum = r + 1;
    const cells = records[r] ?? [];
    const byField = new Map<string, string>();
    for (const [colIdx, field] of colMap.entries()) {
      if (field === "balance" || field === "balanceCurrency") continue;
      const val = String(cells[colIdx] ?? "").trim();
      if (field === "description" || field === "daneOperacji") {
        const key = field === "daneOperacji" ? "daneOperacji" : "description";
        const prev = byField.get(key) ?? "";
        byField.set(key, prev ? `${prev} ${val}`.trim() : val);
      } else {
        byField.set(field, val);
      }
    }

    const dateStr = byField.get("date") ?? "";
    const amountStr = byField.get("amount") ?? "";
    const daneOperacji = byField.get("daneOperacji")?.trim() ?? "";
    const typOperacji = byField.get("typOperacji")?.trim();
    const descSimple = byField.get("description") ?? "";
    const currencyCell = byField.get("currency")?.trim().toUpperCase();

    const bookingDate = parseDateCell(dateStr);
    if (!bookingDate) {
      errors.push({ line: lineNum, message: `Nieprawidłowa data: ${dateStr || "(pusto)"}` });
      continue;
    }

    const pln = parsePolishNumber(amountStr);
    if (pln === null) {
      errors.push({ line: lineNum, message: `Nieprawidłowa kwota: ${amountStr || "(pusto)"}` });
      continue;
    }

    const valueDateStr = byField.get("valueDate");
    const valueDate = valueDateStr ? parseDateCell(valueDateStr) ?? undefined : undefined;

    let description: string;
    let counterpartyName: string | undefined;
    let counterpartyAccount: string | undefined;

    if (format === "ipko-biznes") {
      const built = buildIpkoDescriptionAndParties(daneOperacji, typOperacji);
      description = built.description;
      counterpartyName = built.counterpartyName;
      counterpartyAccount = built.counterpartyAccount;
    } else {
      description = descSimple || "(brak opisu)";
      counterpartyName = byField.get("counterparty") || undefined;
      counterpartyAccount = byField.get("account") || undefined;
    }

    const row: ParsedBankRow = {
      bookingDate,
      valueDate,
      amountGrosze: toGrosze(pln),
      description,
      counterpartyName,
      counterpartyAccount,
    };
    if (currencyCell) row.currency = currencyCell;
    rows.push(row);
  }

  return { rows, errors, format };
}
