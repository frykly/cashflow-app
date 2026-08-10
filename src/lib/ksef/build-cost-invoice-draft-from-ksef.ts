import { decToNumber } from "@/lib/cashflow/money";
import { isoToDateInputValue } from "@/lib/date-input";
import { ksefImportNotes } from "@/lib/ksef/ksef-import-marker";
import { resolveKsefDefaultPlannedDate, resolveKsefPaymentDueDate } from "@/lib/ksef/ksef-payment-dates";
import { inferVatRateFromAmounts } from "@/lib/vat-rate";
import type { KsefDocument } from "@prisma/client";

/** Draft shape compatible with CostInvoiceFormModal (date fields as YYYY-MM-DD). */
export type CostInvoiceFormDraft = {
  documentNumber: string;
  supplier: string;
  description: string;
  vatRate: number;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  amountToPayGross?: string | null;
  documentDate?: string | null;
  paymentDueDate?: string | null;
  plannedPaymentDate?: string | null;
  status: string;
  paid: boolean;
  actualPaymentDate: string | null;
  paymentSource: string;
  notes: string;
  costPlaceKind?: string;
  account5Code?: string | null;
  accountingNote?: string;
  vehicleId?: string | null;
  expenseCategoryId?: string | null;
  projectId?: string | null;
};

export type KsefCostDraftSource = Pick<
  KsefDocument,
  "ksefId" | "invoiceNumber" | "sellerName" | "netAmount" | "vatAmount" | "grossAmount" | "issueDate" | "paymentDueDate" | "xmlFetchStatus" | "xmlPayload"
>;

function toKsefDocumentLike(source: KsefCostDraftSource): KsefDocument {
  const issueDate =
    source.issueDate instanceof Date ? source.issueDate : new Date(String(source.issueDate));
  const paymentDueDate =
    source.paymentDueDate == null
      ? null
      : source.paymentDueDate instanceof Date
        ? source.paymentDueDate
        : new Date(String(source.paymentDueDate));
  return {
    ...source,
    issueDate,
    paymentDueDate,
  } as KsefDocument;
}

function resolveDraftAmountToPayGross(
  doc: KsefCostDraftSource,
  previewAmountToPay?: string | null,
): string | null {
  if (previewAmountToPay?.trim()) {
    const gross = decToNumber(doc.grossAmount);
    const toPay = decToNumber(previewAmountToPay);
    if (Math.abs(toPay - gross) > 0.02) return toPay.toFixed(2);
  }
  return null;
}

/** Build form draft from KSeF document for ksef-import prefill. */
export function buildCostInvoiceDraftFromKsef(
  source: KsefCostDraftSource,
  preview?: { amountToPay?: string | null; paymentDueDate?: string | null; issueDate?: string | null },
): Partial<CostInvoiceFormDraft> {
  const doc = toKsefDocumentLike(source);
  const net = decToNumber(doc.netAmount);
  const vat = decToNumber(doc.vatAmount);
  const gross = decToNumber(doc.grossAmount);
  const vatRate = inferVatRateFromAmounts(net, vat);
  const paymentDueDate = preview?.paymentDueDate
    ? new Date(preview.paymentDueDate)
    : resolveKsefPaymentDueDate(doc);
  const plannedPaymentDate = resolveKsefDefaultPlannedDate(doc);
  const amountToPayGross = resolveDraftAmountToPayGross(source, preview?.amountToPay);

  return {
    documentNumber: doc.invoiceNumber.trim(),
    supplier: doc.sellerName.trim(),
    description: "",
    vatRate,
    netAmount: net.toFixed(2),
    vatAmount: vat.toFixed(2),
    grossAmount: gross.toFixed(2),
    amountToPayGross,
    documentDate: isoToDateInputValue(
      preview?.issueDate ?? (doc.issueDate instanceof Date ? doc.issueDate.toISOString() : String(doc.issueDate)),
    ),
    paymentDueDate: isoToDateInputValue(paymentDueDate.toISOString()),
    plannedPaymentDate: isoToDateInputValue(plannedPaymentDate.toISOString()),
    status: "DO_ZAPLATY",
    paid: false,
    actualPaymentDate: null,
    paymentSource: "MAIN",
    notes: ksefImportNotes(doc.ksefId),
    expenseCategoryId: null,
    projectId: null,
    costPlaceKind: "UNCLASSIFIED",
    accountingNote: "",
    vehicleId: null,
  };
}
