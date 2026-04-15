import { inferVatRateFromAmounts, type VatRatePct } from "@/lib/vat-rate";
import type { InvoicePdfParsedValues } from "./types";
import { extractPlMoneyTokens } from "./pl-money";

const EPS = 0.05;

/**
 * pdf-parse często skleja „12 040,82” + „2” + „769,39” → „12 040,822 769,39” (fałszywy milion).
 * Wstawia spację przed pojedynczą cyfrą między groszami a kolejną kwotą.
 */
function fixGluedPlTotals(s: string): string {
  return s.replace(
    /(\d{1,3}(?:\s+\d{3})+,\d{2})(\d)\s+(\d{3},\d{2})/g,
    "$1 $2 $3",
  );
}

/** Pierwsza kwota z linii „Łącznie” (na realnych PDF brutto jest tu, a „Do zapłaty:” bywa puste / pod „Słownie”). */
function extractGrossFromLacznie(lines: string[]): number | null {
  for (const line of lines) {
    if (!/łącznie/i.test(line)) continue;
    const ts = extractPlMoneyTokens(line);
    if (ts[0]) return ts[0].value;
  }
  return null;
}

/** Sam numer w formacie RRRR/MM/NN… — tylko dopasowanie, nie cała linia. */
const INVOICE_NUM_STRUCTURED = /\b(\d{4})\/(\d{2})\/(\d+)\b/;

function normalizeInvoiceNumberMatch(m: RegExpMatchArray): string {
  return `${m[1]}/${m[2]}/${m[3]}`;
}

/** Linie wyraźnie niebędące nagłówkiem numeru (np. opis pozycji) — pomiń przy szukaniu numeru. */
function isBlockedLineForInvoiceNumber(line: string): boolean {
  const low = line.toLowerCase();
  if (/rozliczenie\s+budow|rozliczenie\s+budowy/.test(low)) return true;
  return false;
}

/**
 * Wyłącznie match `\d{4}/\d{2}/\d+` — pierwsze sensowne wystąpienie spoza zablokowanych linii.
 */
function extractInvoiceNumber(text: string): string | null {
  const lines = text.split(/\n/).map((l) => l.trim());
  for (const line of lines) {
    if (isBlockedLineForInvoiceNumber(line)) continue;
    const m = line.match(INVOICE_NUM_STRUCTURED);
    if (m) return normalizeInvoiceNumberMatch(m);
  }
  return null;
}

function ymdFromDmy(d: number, mo: number, y: number): string | null {
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function firstDateDmyInSegment(segment: string): string | null {
  const re = /(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    const ymd = ymdFromDmy(Number(m[1]), Number(m[2]), Number(m[3]));
    if (ymd) return ymd;
  }
  return null;
}

function findDateOnLabeledLine(
  lines: string[],
  labelMatchers: RegExp[],
): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const hit = labelMatchers.some((re) => re.test(line));
    if (!hit) continue;
    const onLine = firstDateDmyInSegment(line);
    if (onLine) return onLine;
    const next = lines[i + 1] ?? "";
    const onNext = firstDateDmyInSegment(next);
    if (onNext) return onNext;
  }
  return null;
}

function moneyValuesFromLine(segment: string): number[] {
  return extractPlMoneyTokens(segment).map((t) => t.value);
}

/** PDF często dzieli „Suma:” i kwoty na dwie linie — scalaj, aż będzie ≥3 kwoty lub limit. */
function mergeLabelWithFollowingAmountLines(lines: string[], startIdx: number, maxExtra = 3): string {
  let s = (lines[startIdx] ?? "").trim();
  let j = startIdx;
  let extra = 0;
  while (extra < maxExtra && j + 1 < lines.length && moneyValuesFromLine(s).length < 3) {
    const next = (lines[j + 1] ?? "").trim();
    if (!next) {
      j++;
      extra++;
      continue;
    }
    if (/^(nabywca|sprzedawca|odbiorca|dostawca|wystawca|nip\s*[:/]|do\s+zapłaty|do\s+zaplaty|pozycj|strona\s+\d)/i.test(next)) {
      break;
    }
    s = `${s} ${next}`.trim();
    j++;
    extra++;
  }
  return s;
}

function firstAmountAfterDoZaplaty(line: string): number | null {
  const re = /do\s+zapłaty|do\s+zaplaty/i;
  const m = re.exec(line);
  if (!m || m.index === undefined) return null;
  const tail = line.slice(m.index + m[0].length);
  const tailTokens = extractPlMoneyTokens(tail);
  console.log("[invoice-pdf-money] raw line (Do zapłaty):", line);
  console.log("[invoice-pdf-money] extracted money tokens:", tailTokens.map((x) => x.raw));
  const gross = tailTokens[0]?.value ?? null;
  console.log("[invoice-pdf-money] selected gross token:", gross);
  if (gross != null) return gross;
  const lineTokens = extractPlMoneyTokens(line);
  console.log("[invoice-pdf-money] fallback tokens (full line):", lineTokens.map((x) => x.raw));
  return lineTokens[0]?.value ?? null;
}

/** Blok „Suma …” — może obejmować kolejną linię z kwotami. */
function findSumaSummaryLine(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!/\bsuma\b/i.test(line)) continue;
    if (/podsumowanie/i.test(line)) continue;
    const merged = mergeLabelWithFollowingAmountLines(lines, i);
    if (moneyValuesFromLine(merged).length >= 3) return merged;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!/\bsuma\b/i.test(line) || /podsumowanie/i.test(line)) continue;
    return mergeLabelWithFollowingAmountLines(lines, i);
  }
  return null;
}

/** Gdy brak słowa „Suma” — „Razem”/„Łącznie” + opcjonalnie następna linia. */
function findSumaLikeTotalLine(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/podsumowanie/i.test(line)) continue;
    if (!/(?:\brazem\b|łącznie|lacznie)/i.test(line)) continue;
    const merged = mergeLabelWithFollowingAmountLines(lines, i);
    if (moneyValuesFromLine(merged).length >= 3) return merged;
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/podsumowanie/i.test(line)) continue;
    if (!/(?:\brazem\b|łącznie|lacznie)/i.test(line)) continue;
    return mergeLabelWithFollowingAmountLines(lines, i);
  }
  return null;
}

const SUM_CHECK = (a: number, b: number, c: number) =>
  Math.abs(a + b - c) <= Math.max(EPS, c * 1e-9);

/**
 * Z linii „Suma …” — trzy kolejne kwoty spełniające net+VAT≈brutto;
 * jeśli jest „Do zapłaty”, można podmienić brutto na kwotę z niej, gdy net+VAT się zgadza.
 */
function parseNetVatGrossFromSumaLine(
  line: string,
  grossFromDoZaplaty: number | null,
): { net: number; vat: number; gross: number } | null {
  const amounts = moneyValuesFromLine(line);
  if (amounts.length < 3) return null;

  for (let i = 0; i <= amounts.length - 3; i++) {
    const net = amounts[i]!;
    const vat = amounts[i + 1]!;
    const gross = amounts[i + 2]!;
    if (!SUM_CHECK(net, vat, gross)) continue;
    if (
      grossFromDoZaplaty != null &&
      Math.abs(net + vat - grossFromDoZaplaty) <= Math.max(0.06, grossFromDoZaplaty * 1e-6)
    ) {
      return { net, vat, gross: grossFromDoZaplaty };
    }
    return { net, vat, gross };
  }

  const net = amounts[amounts.length - 3]!;
  const vat = amounts[amounts.length - 2]!;
  const gross = amounts[amounts.length - 1]!;
  if (SUM_CHECK(net, vat, gross)) {
    if (
      grossFromDoZaplaty != null &&
      Math.abs(net + vat - grossFromDoZaplaty) <= Math.max(0.06, grossFromDoZaplaty * 1e-6)
    ) {
      return { net, vat, gross: grossFromDoZaplaty };
    }
    return { net, vat, gross };
  }

  if (grossFromDoZaplaty != null) {
    const g = grossFromDoZaplaty;
    for (let i = 0; i <= amounts.length - 2; i++) {
      const n = amounts[i]!;
      const v = amounts[i + 1]!;
      if (Math.abs(n + v - g) <= Math.max(0.06, g * 1e-6)) {
        return { net: n, vat: v, gross: g };
      }
    }
  }

  return null;
}

function sanitizePartyName(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw
    .replace(/^[\s„""'«»]+|[\s„""'«»]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 2) return null;
  return s.slice(0, 300);
}

/**
 * Jedna linia po nagłówku sekcji (np. Nabywca): treść po `:` na tej samej linii, inaczej pierwsza następna sensowna.
 */
function firstLineAfterPartyHeader(
  lines: string[],
  header: "nabywca" | "odbiorca" | "sprzedawca" | "dostawca" | "wystawca",
): string | null {
  const startRe = new RegExp(`^\\s*${header}\\s*(?:[:\\s]|$)`, "i");
  const captureRe = new RegExp(`^\\s*${header}\\s*[:\\s]\\s*(.+)$`, "i");

  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").trim();
    if (!startRe.test(line)) continue;

    const cap = line.match(captureRe);
    const rest = cap?.[1]?.trim() ?? "";
    if (
      rest.length >= 2 &&
      !/^nip\s*[:/]/i.test(rest) &&
      !/^ul\.?\s/i.test(rest) &&
      !/^\d{2}-\d{3}\s/.test(rest)
    ) {
      return sanitizePartyName(rest);
    }

    const next = (lines[i + 1] ?? "").trim();
    if (
      next.length >= 2 &&
      !/^nip\s*[:/]/i.test(next) &&
      !/^ul\.?\s/i.test(next) &&
      !/^\d{2}-\d{3}\s/.test(next)
    ) {
      return sanitizePartyName(next);
    }
  }
  return null;
}

function pickParty(text: string, kind: "cost" | "income"): string | null {
  const lines = text.split(/\n/).map((l) => l.trim());
  if (kind === "cost") {
    return (
      firstLineAfterPartyHeader(lines, "sprzedawca") ??
      firstLineAfterPartyHeader(lines, "dostawca") ??
      firstLineAfterPartyHeader(lines, "wystawca")
    );
  }
  return firstLineAfterPartyHeader(lines, "nabywca") ?? firstLineAfterPartyHeader(lines, "odbiorca");
}

export function parsePolishInvoiceText(
  text: string,
  kind: "cost" | "income",
): InvoicePdfParsedValues & { warnings: string[]; filledFieldKeys: string[] } {
  const warnings: string[] = [];
  const filledFieldKeys: string[] = [];
  const out: InvoicePdfParsedValues = {};

  let normalized = String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u202f\u2009\u2007\ufeff]/g, " ");
  normalized = fixGluedPlTotals(normalized);
  if (normalized.trim().length < 40) {
    warnings.push("Za mało tekstu z PDF (być może skan bez OCR) — wypełnij formularz ręcznie.");
    return { ...out, warnings, filledFieldKeys };
  }

  const lines = normalized.split(/\n/).map((l) => l.trim());

  const invNo = extractInvoiceNumber(normalized);
  if (invNo) {
    if (kind === "cost") {
      out.documentNumber = invNo;
      filledFieldKeys.push("documentNumber");
    } else {
      out.invoiceNumber = invNo;
      filledFieldKeys.push("invoiceNumber");
    }
  }

  const party = pickParty(normalized, kind);
  if (party) {
    if (kind === "cost") {
      out.supplier = party;
      filledFieldKeys.push("supplier");
    } else {
      out.contractor = party;
      filledFieldKeys.push("contractor");
    }
  }

  const issueDate = findDateOnLabeledLine(lines, [
    /data\s+wystawienia/i,
    /data\s+wystawienia\s+faktury/i,
  ]);
  const saleDate = findDateOnLabeledLine(lines, [/data\s+sprzedaży/i, /data\s+sprzedazy/i]);
  const issue = issueDate ?? saleDate;
  const due = findDateOnLabeledLine(lines, [
    /termin\s+płatności/i,
    /termin\s+platnosci/i,
    /płatność\s+do/i,
    /platnosc\s+do/i,
  ]);

  if (issue) {
    if (kind === "cost") {
      out.documentDate = issue;
      filledFieldKeys.push("documentDate");
    } else {
      out.issueDate = issue;
      filledFieldKeys.push("issueDate");
    }
  }
  if (due) {
    out.paymentDueDate = due;
    filledFieldKeys.push("paymentDueDate");
  }

  let grossDoZaplaty: number | null = extractGrossFromLacznie(lines);
  let doZaplatyBlock: string | null = null;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li] ?? "";
    if (!/do\s+zapłaty|do\s+zaplaty/i.test(line)) continue;
    let block = line.trim();
    let g = firstAmountAfterDoZaplaty(block);
    if (g == null && li + 1 < lines.length) {
      const nxt = (lines[li + 1] ?? "").trim();
      if (!/^słownie:|^numer\s+konta|^\d{2}\s+\d{4}/i.test(nxt)) {
        block = `${block} ${nxt}`.trim();
        console.log("[invoice-pdf-money] Do zapłaty merged block (2 lines):", block);
        g = firstAmountAfterDoZaplaty(block);
      }
    }
    if (g == null) {
      for (let b = li - 1; b >= Math.max(0, li - 10); b--) {
        const prev = lines[b] ?? "";
        if (/łącznie/i.test(prev)) {
          const ts = extractPlMoneyTokens(prev);
          if (ts[0]) {
            g = ts[0].value;
            console.log("[invoice-pdf-money] brutto z linii przed „Do zapłaty” (Łącznie):", g);
            break;
          }
        }
        const ts = extractPlMoneyTokens(prev);
        const big = ts.filter((t) => t.value >= 100);
        if (big.length) {
          g = big[big.length - 1]!.value;
          console.log("[invoice-pdf-money] brutto ze skanu wstecz (linia przed Do zapłaty):", g);
          break;
        }
      }
    }
    if (g == null && li + 1 < lines.length) {
      const nextTok = extractPlMoneyTokens(lines[li + 1] ?? "");
      if (nextTok[0]) g = nextTok[0]!.value;
    }
    doZaplatyBlock = block;
    if (g != null) {
      grossDoZaplaty = g;
      break;
    }
  }
  if (grossDoZaplaty == null) {
    grossDoZaplaty = extractGrossFromLacznie(lines);
  }
  console.log("[invoice-pdf-money] Do zapłaty block used:", doZaplatyBlock ?? "(brak)");
  console.log("[invoice-pdf-money] brutto final (Łącznie / Do zapłaty):", grossDoZaplaty);

  const sumaLine = findSumaSummaryLine(lines) ?? findSumaLikeTotalLine(lines);
  if (sumaLine) {
    const st = extractPlMoneyTokens(sumaLine);
    console.log("[invoice-pdf-money] raw block (Suma / Razem, może łączone linie):", sumaLine);
    console.log("[invoice-pdf-money] Suma money tokens:", st.map((x) => `${x.raw}=>${x.value}`));
  }
  const triple = sumaLine ? parseNetVatGrossFromSumaLine(sumaLine, grossDoZaplaty) : null;

  console.log("[invoice-pdf] numer:", invNo ?? "(brak)");
  console.log("[invoice-pdf] brutto (Do zapłaty):", grossDoZaplaty ?? "(brak)");
  console.log("[invoice-pdf] linia Suma:", sumaLine ?? "(brak)");
  console.log("[invoice-pdf] triple z Suma:", triple);

  if (grossDoZaplaty != null && triple) {
    const g =
      Math.abs(triple.gross - grossDoZaplaty) <= Math.max(1, grossDoZaplaty * 0.0001)
        ? triple.gross
        : grossDoZaplaty;
    const net = triple.net;
    const vat = triple.vat;
    const sumOk = Math.abs(net + vat - g) <= Math.max(0.06, g * 0.0001);
    console.log("[invoice-pdf-money] consistency net+vat vs g:", { net, vat, g, sumOk, diff: Math.abs(net + vat - g) });
    if (sumOk) {
      out.netAmount = net.toFixed(2);
      out.vatAmount = vat.toFixed(2);
      out.grossAmount = g.toFixed(2);
      out.vatRate = inferVatRateFromAmounts(net, vat);
      filledFieldKeys.push("netAmount", "vatAmount", "grossAmount", "vatRate");
    } else {
      console.log("[invoice-pdf-money] REJECTED triple+doZapłaty: sum check failed");
      warnings.push(
        "Kwoty z linii „Suma” i „Do zapłaty” nie są spójne — uzupełniono tylko brutto z „Do zapłaty”.",
      );
      out.grossAmount = grossDoZaplaty.toFixed(2);
      filledFieldKeys.push("grossAmount");
    }
  } else if (grossDoZaplaty != null) {
    warnings.push(
      "Znaleziono „Do zapłaty”, ale nie udało się odczytać spójnego zestawu netto/VAT z linii „Suma” — uzupełniono tylko brutto.",
    );
    out.grossAmount = grossDoZaplaty.toFixed(2);
    filledFieldKeys.push("grossAmount");
  } else if (triple) {
    const { net, vat, gross } = triple;
    if (Math.abs(net + vat - gross) <= Math.max(0.06, gross * 0.0001)) {
      out.netAmount = net.toFixed(2);
      out.vatAmount = vat.toFixed(2);
      out.grossAmount = gross.toFixed(2);
      out.vatRate = inferVatRateFromAmounts(net, vat);
      filledFieldKeys.push("netAmount", "vatAmount", "grossAmount", "vatRate");
    }
  }

  console.log("[invoice-pdf-e2e-parse]", {
    kind,
    documentNumber: out.documentNumber,
    invoiceNumber: out.invoiceNumber,
    supplier: out.supplier,
    contractor: out.contractor,
    issueDate: out.issueDate,
    documentDate: out.documentDate,
    paymentDueDate: out.paymentDueDate,
    netAmount: out.netAmount,
    vatAmount: out.vatAmount,
    grossAmount: out.grossAmount,
    warnings,
  });

  return { ...out, warnings, filledFieldKeys: [...new Set(filledFieldKeys)] };
}
