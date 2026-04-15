import { amountsFromGrossRate, inferVatRateFromAmounts, type VatRatePct } from "@/lib/vat-rate";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import type { InvoicePdfParsedValues } from "./types";

const EPS = 0.05;

function ymdFromDmy(d: number, mo: number, y: number): string | null {
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}`;
}

/** Pierwsza sensowna data przy etykiecie (jedna linia). */
function dateNearLabel(text: string, labelStr: string): string | null {
  const re = new RegExp(labelStr + "\\s*[:\\s]+(\\d{1,2})[.\\-/](\\d{1,2})[.\\-/](\\d{4})", "i");
  const m = text.match(re);
  if (!m) return null;
  return ymdFromDmy(Number(m[1]), Number(m[2]), Number(m[3]));
}

function parsePlAmountToken(raw: string): number | null {
  const t = raw.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalizeDecimalInput(t));
  return Number.isFinite(n) ? n : null;
}

/** Pierwsza kwota z linii (PL). */
function firstAmountInLine(line: string): number | null {
  const re = /(\d{1,3}(?:\s\d{3})*(?:,\d{2})?|\d+(?:,\d{2}))/g;
  let best: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const n = parsePlAmountToken(m[1]!);
    if (n != null && n > 0 && (best == null || n > best)) best = n;
  }
  return best;
}

function findLabeledAmount(text: string, patterns: RegExp[]): number | null {
  const lines = text.split(/\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const p of patterns) {
      if (p.test(line)) {
        let n = firstAmountInLine(line);
        if (n == null && i + 1 < lines.length) n = firstAmountInLine(lines[i + 1]!);
        if (n != null) return n;
      }
    }
  }
  return null;
}

function extractInvoiceNumber(text: string): string | null {
  const patterns: RegExp[] = [
    /Numer\s+faktury\s*[:\s]+([A-Z0-9][A-Z0-9\/\-\s]{1,45}?)(?:\s*$|\s*\n)/i,
    /Faktura\s+(?:VAT\s+)?(?:nr\.?|Nr\.?)\s*[:\s]+([A-Z0-9][A-Z0-9\/\-\s]{1,45}?)(?:\s*$|\s*\n)/i,
    /\b(FV\/\d{4}\/\d{1,2}\/\d+)\b/i,
    /\b(FA\/\d{4}\/\d{1,2}\/\d+)\b/i,
    /\b(FV\s*\d+\/\d+\/\d+)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) {
      const s = m[1].replace(/\s+/g, " ").trim();
      if (s.length >= 3 && s.length <= 80) return s;
    }
  }
  return null;
}

function firstMeaningfulLineAfter(header: string, text: string): string | null {
  const low = text.toLowerCase();
  const idx = low.indexOf(header.toLowerCase());
  if (idx < 0) return null;
  const tail = text.slice(idx + header.length);
  const lines = tail
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2);
  for (const line of lines.slice(0, 8)) {
    if (/^nip\s*[:/]/i.test(line)) continue;
    if (/^\d{3}-\d{3}-\d{2}-\d{2}$/.test(line.replace(/\s/g, ""))) continue;
    if (/^ul\.|^\d{2}-\d{3}\s/i.test(line)) continue;
    if (line.length > 120) continue;
    return line.slice(0, 200);
  }
  return null;
}

function pickParty(text: string, kind: "cost" | "income"): string | null {
  if (kind === "cost") {
    return (
      firstMeaningfulLineAfter("sprzedawca", text) ??
      firstMeaningfulLineAfter("dostawca", text) ??
      firstMeaningfulLineAfter("wystawca", text)
    );
  }
  return firstMeaningfulLineAfter("nabywca", text) ?? firstMeaningfulLineAfter("odbiorca", text);
}

function reconcileAmounts(
  net: number | null,
  vat: number | null,
  gross: number | null,
  warnings: string[],
): { net: string; vat: string; gross: string; vatRate: VatRatePct } | null {
  if (gross != null && gross > 0 && net != null && vat != null) {
    if (Math.abs(net + vat - gross) <= EPS) {
      const rate = inferVatRateFromAmounts(net, vat);
      return {
        net: net.toFixed(2),
        vat: vat.toFixed(2),
        gross: gross.toFixed(2),
        vatRate: rate,
      };
    }
    warnings.push("Kwoty netto, VAT i brutto z PDF nie sumują się — pominięto automatyczne uzupełnianie kwot (sprawdź ręcznie).");
  }

  if (gross != null && gross > 0 && net != null && vat == null) {
    const impliedVat = gross - net;
    if (impliedVat >= -EPS) {
      const rate = inferVatRateFromAmounts(net, Math.max(0, impliedVat));
      const { netAmount, vatAmount } = amountsFromGrossRate(gross.toFixed(2), rate);
      return { net: netAmount, vat: vatAmount, gross: gross.toFixed(2), vatRate: rate };
    }
  }

  if (gross != null && gross > 0) {
    const rate: VatRatePct = 23;
    const { netAmount, vatAmount } = amountsFromGrossRate(gross.toFixed(2), rate);
    warnings.push("Domyślnie przyjęto stawkę VAT 23% do rozłożenia brutto (PDF nie dostarczył pełnego zestawu kwot).");
    return { net: netAmount, vat: vatAmount, gross: gross.toFixed(2), vatRate: rate };
  }

  if (net != null && net > 0 && vat != null && vat >= 0) {
    const g = net + vat;
    const rate = inferVatRateFromAmounts(net, vat);
    return { net: net.toFixed(2), vat: vat.toFixed(2), gross: g.toFixed(2), vatRate: rate };
  }

  return null;
}

export function parsePolishInvoiceText(text: string, kind: "cost" | "income"): InvoicePdfParsedValues & { warnings: string[]; filledFieldKeys: string[] } {
  const warnings: string[] = [];
  const filledFieldKeys: string[] = [];
  const out: InvoicePdfParsedValues = {};

  const t = text.replace(/\r/g, "\n");
  if (t.trim().length < 40) {
    warnings.push("Za mało tekstu z PDF (być może skan bez OCR) — wypełnij formularz ręcznie.");
    return { ...out, warnings, filledFieldKeys };
  }

  const invNo = extractInvoiceNumber(t);
  if (invNo) {
    if (kind === "cost") {
      out.documentNumber = invNo;
      filledFieldKeys.push("documentNumber");
    } else {
      out.invoiceNumber = invNo;
      filledFieldKeys.push("invoiceNumber");
    }
  }

  const party = pickParty(t, kind);
  if (party) {
    if (kind === "cost") {
      out.supplier = party;
      filledFieldKeys.push("supplier");
    } else {
      out.contractor = party;
      filledFieldKeys.push("contractor");
    }
  }

  const issue =
    dateNearLabel(t, "Data\\s+wystawienia") ??
    dateNearLabel(t, "Data\\s+sprzedaży") ??
    dateNearLabel(t, "Data\\s+faktury");
  const due = dateNearLabel(t, "Termin\\s+płatności") ?? dateNearLabel(t, "Płatność\\s+do");

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

  const netAmt = findLabeledAmount(t, [
    /razem\s+netto|wartość\s+netto|suma\s+netto|netto\s*$/i,
    /netto\s+pln/i,
  ]);
  const vatAmt = findLabeledAmount(t, [/kwota\s+vat|podatek\s+vat|vat\s+23|vat\s+8/i, /razem\s+vat/i]);
  const grossAmt = findLabeledAmount(t, [/razem\s+brutto|do\s+zapłaty|kwota\s+brutto|brutto\s+pln/i, /zapłacono|należność/i]);

  const rec = reconcileAmounts(netAmt, vatAmt, grossAmt, warnings);
  if (rec) {
    out.netAmount = rec.net;
    out.vatAmount = rec.vat;
    out.grossAmount = rec.gross;
    out.vatRate = rec.vatRate;
    filledFieldKeys.push("netAmount", "vatAmount", "grossAmount", "vatRate");
  }

  return { ...out, warnings, filledFieldKeys: [...new Set(filledFieldKeys)] };
}
