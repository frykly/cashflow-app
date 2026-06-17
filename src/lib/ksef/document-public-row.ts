import type { KsefDocument } from "@prisma/client";

/** Serializacja rekordu KsefDocument do JSON API (bez zależności od importu kosztów). */
export function ksefDocumentToPublicRow(doc: KsefDocument) {
  return {
    id: doc.id,
    ksefId: doc.ksefId,
    source: doc.source,
    workflowStatus: doc.workflowStatus,
    documentDirection: doc.documentDirection,
    documentType: doc.documentType,
    invoiceNumber: doc.invoiceNumber,
    issueDate: doc.issueDate.toISOString(),
    saleDate: doc.saleDate?.toISOString() ?? null,
    paymentDueDate: doc.paymentDueDate?.toISOString() ?? null,
    sellerName: doc.sellerName,
    sellerTaxId: doc.sellerTaxId,
    buyerName: doc.buyerName,
    buyerTaxId: doc.buyerTaxId,
    netAmount: doc.netAmount.toString(),
    vatAmount: doc.vatAmount.toString(),
    grossAmount: doc.grossAmount.toString(),
    currency: doc.currency,
    duplicateOfCostInvoiceId: doc.duplicateOfCostInvoiceId,
    duplicateMatchSummary: doc.duplicateMatchSummary,
    importedAsCostInvoiceId: doc.importedAsCostInvoiceId,
    importedAsRevenueInvoiceId: doc.importedAsRevenueInvoiceId,
    rejectedAt: doc.rejectedAt?.toISOString() ?? null,
    importedAt: doc.importedAt?.toISOString() ?? null,
    processedAt: doc.processedAt?.toISOString() ?? null,
    syncSessionId: doc.syncSessionId,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
