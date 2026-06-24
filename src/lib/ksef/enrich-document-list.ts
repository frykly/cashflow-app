import type { KsefDocument } from "@prisma/client";
import { ksefDocumentToPublicRow } from "@/lib/ksef/document-public-row";
import { resolveKsefDocumentPaymentAmounts } from "@/lib/ksef/ksef-payment-amounts";
import {
  loadInvoiceMapsForPaymentStatus,
  paymentFieldsForDocument,
  resolveLinkedInvoiceIds,
} from "@/lib/ksef/payment-status";

export async function enrichKsefDocumentListRows(docs: KsefDocument[]) {
  const costIds = new Set<string>();
  const incomeIds = new Set<string>();
  for (const doc of docs) {
    const { costId, incomeId } = resolveLinkedInvoiceIds(doc);
    if (costId) costIds.add(costId);
    if (incomeId) incomeIds.add(incomeId);
  }

  const { costById, incomeById } = await loadInvoiceMapsForPaymentStatus(
    [...costIds],
    [...incomeIds],
  );

  return docs.map((doc) => {
    const { costId, incomeId } = resolveLinkedInvoiceIds(doc);
    const linkedCost = costId ? costById.get(costId) : null;
    return {
      ...ksefDocumentToPublicRow(doc),
      ...paymentFieldsForDocument(doc, costById, incomeById),
      ...resolveKsefDocumentPaymentAmounts(doc, linkedCost),
    };
  });
}
