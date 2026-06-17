/** Wyciąga rozbicie VAT z rawPayload KSeF, jeśli jest dostępne w metadanych. */
export type VatBreakdownLine = {
  label: string;
  netAmount?: string;
  vatAmount?: string;
  grossAmount?: string;
  rate?: string;
};

export function parseRawPayloadJson(rawPayload: string): unknown {
  try {
    return JSON.parse(rawPayload) as unknown;
  } catch {
    return null;
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function fmtNum(n: unknown): string | undefined {
  if (typeof n === "number" && !Number.isNaN(n)) return n.toFixed(2);
  if (typeof n === "string" && n.trim()) return n.trim();
  return undefined;
}

export function extractVatBreakdownFromRawPayload(rawPayload: string): VatBreakdownLine[] {
  const root = asRecord(parseRawPayloadJson(rawPayload));
  if (!root) return [];

  const candidates = [
    root.vatSummary,
    root.taxSummary,
    root.vatBreakdown,
    root.vatRates,
    root.taxRates,
  ];

  for (const c of candidates) {
    if (!Array.isArray(c)) continue;
    const lines: VatBreakdownLine[] = [];
    for (const item of c) {
      const row = asRecord(item);
      if (!row) continue;
      const rate =
        fmtNum(row.rate) ??
        fmtNum(row.vatRate) ??
        (typeof row.rate === "string" ? row.rate : undefined);
      const net = fmtNum(row.netAmount ?? row.net);
      const vat = fmtNum(row.vatAmount ?? row.vat);
      const gross = fmtNum(row.grossAmount ?? row.gross);
      if (!rate && !net && !vat && !gross) continue;
      lines.push({
        label: rate ? `Stawka ${rate}%` : "Pozycja VAT",
        rate,
        netAmount: net,
        vatAmount: vat,
        grossAmount: gross,
      });
    }
    if (lines.length > 0) return lines;
  }

  return [];
}
