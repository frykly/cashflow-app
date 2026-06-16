export type ParsedInvoiceNumber = { year: number; month: number; seq: number };

const INVOICE_NUMBER_RE = /^(\d{4})\/(\d{1,2})\/(\d+)$/;

/** Parses invoice numbers in YYYY/MM/NNN format; returns null for other shapes. */
export function parseInvoiceNumber(value: string): ParsedInvoiceNumber | null {
  const m = value.trim().match(INVOICE_NUMBER_RE);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const seq = Number(m[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(seq)) return null;
  if (month < 1 || month > 12) return null;
  return { year, month, seq };
}

/** Year → month → sequence; falls back to locale-aware text sort. */
export function compareInvoiceNumbers(a: string, b: string): number {
  const pa = parseInvoiceNumber(a);
  const pb = parseInvoiceNumber(b);
  if (pa && pb) {
    if (pa.year !== pb.year) return pa.year - pb.year;
    if (pa.month !== pb.month) return pa.month - pb.month;
    if (pa.seq !== pb.seq) return pa.seq - pb.seq;
    return a.localeCompare(b, "pl", { sensitivity: "base" });
  }
  return a.localeCompare(b, "pl", { numeric: true, sensitivity: "base" });
}

export function sortByInvoiceNumber<T extends { invoiceNumber: string }>(
  rows: T[],
  order: "asc" | "desc",
): T[] {
  const dir = order === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => dir * compareInvoiceNumbers(a.invoiceNumber, b.invoiceNumber));
}
