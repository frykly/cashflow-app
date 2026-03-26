import type { IncomeInvoice, CostInvoice } from "@prisma/client";

const MISSING_PARTY = "brak dostawcy/kontrahenta";

function partyLabel(name: string | undefined): string {
  if (name === undefined) return MISSING_PARTY;
  const t = name.trim();
  return t || MISSING_PARTY;
}

/** Tekst po "Przychód " do pierwszego " (" lub koniec — numer faktury. */
function extractIncomeInvoiceNumberFromLabel(label: string): string | null {
  if (!label.startsWith("Przychód ")) return null;
  const rest = label.slice("Przychód ".length);
  const idx = rest.indexOf(" (");
  if (idx >= 0) return rest.slice(0, idx).trim();
  return rest.trim();
}

function extractCostDocumentNumberFromLabel(label: string): string | null {
  if (!label.startsWith("Koszt ")) return null;
  const rest = label.slice("Koszt ".length);
  const idx = rest.indexOf(" (");
  if (idx >= 0) return rest.slice(0, idx).trim();
  return rest.trim();
}

export function buildIncomePartyByInvoiceNumber(
  invoices: Pick<IncomeInvoice, "invoiceNumber" | "contractor">[],
): Map<string, string | undefined> {
  const m = new Map<string, string | undefined>();
  for (const inv of invoices) {
    m.set(inv.invoiceNumber, inv.contractor ?? undefined);
  }
  return m;
}

export function buildCostPartyByDocumentNumber(
  invoices: Pick<CostInvoice, "documentNumber" | "supplier">[],
): Map<string, string | undefined> {
  const m = new Map<string, string | undefined>();
  for (const inv of invoices) {
    m.set(inv.documentNumber, inv.supplier ?? undefined);
  }
  return m;
}

/** Jedna linia szczegółów prognozy / ruch — dopisuje kontrahenta lub dostawcę. */
export function enrichMovementLabel(
  kind: string,
  label: string,
  incomeByInvoiceNumber: Map<string, string | undefined>,
  costByDocumentNumber: Map<string, string | undefined>,
): string {
  if (kind === "income") {
    const num = extractIncomeInvoiceNumberFromLabel(label);
    if (num === null) return label;
    return `${label} (${partyLabel(incomeByInvoiceNumber.get(num))})`;
  }
  if (kind === "cost") {
    const num = extractCostDocumentNumberFromLabel(label);
    if (num === null) return label;
    return `${label} (${partyLabel(costByDocumentNumber.get(num))})`;
  }
  return label;
}

/**
 * Wzbogaca eventsSummary o kontrahenta/dostawcę dla ruchów income/cost (prognoza eksport).
 */
export function enrichForecastEventsSummary(
  ev: string,
  incomeByInvoiceNumber: Map<string, string | undefined>,
  costByDocumentNumber: Map<string, string | undefined>,
): string {
  if (!ev) return ev;
  return ev
    .split(" | ")
    .map((segment) => {
      const colon = segment.indexOf(":");
      if (colon < 0) return segment;
      const kind = segment.slice(0, colon);
      const label = segment.slice(colon + 1);
      const enriched = enrichMovementLabel(kind, label, incomeByInvoiceNumber, costByDocumentNumber);
      return `${kind}:${enriched}`;
    })
    .join(" | ");
}
