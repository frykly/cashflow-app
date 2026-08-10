import type { KsefDocument } from "@prisma/client";
import { decToNumber } from "@/lib/cashflow/money";
import { ksefImportNotes } from "@/lib/ksef/ksef-import-marker";
import { resolveAmountToPayGrossFromKsefXml } from "@/lib/ksef/ksef-payment-amounts";
import { resolveKsefDefaultPlannedDate, resolveKsefPaymentDueDate } from "@/lib/ksef/ksef-payment-dates";
import type { KsefImportCostBody } from "@/lib/validation/ksef-import-schemas";
import { inferVatRateFromAmounts } from "@/lib/vat-rate";

function dateToIso(d: Date): string {
  return d.toISOString();
}

/** Mapuje dokument KSeF + body importu na payload zgodny z costInvoiceCreateSchema. */
export function buildCostInvoiceCreatePayloadFromKsef(
  doc: KsefDocument,
  options: KsefImportCostBody,
): Record<string, unknown> {
  const net = decToNumber(doc.netAmount);
  const vat = decToNumber(doc.vatAmount);
  const gross = decToNumber(doc.grossAmount);
  const vatRate = inferVatRateFromAmounts(net, vat);
  const documentDate = doc.issueDate;
  const paymentDueDate = resolveKsefPaymentDueDate(doc);
  const plannedPaymentDate = resolveKsefDefaultPlannedDate(doc, options.plannedPaymentDate);

  return {
    documentNumber: doc.invoiceNumber.trim(),
    supplier: doc.sellerName.trim(),
    description: options.description?.trim() ?? "",
    vatRate,
    vatOnly: false,
    netAmount: net.toString(),
    vatAmount: vat.toString(),
    grossAmount: gross.toString(),
    documentDate: dateToIso(documentDate),
    paymentDueDate: dateToIso(paymentDueDate),
    plannedPaymentDate: dateToIso(plannedPaymentDate),
    status: options.status ?? "DO_ZAPLATY",
    paid: false,
    paymentSource: options.paymentSource ?? "MAIN",
    notes: options.notes?.trim() || ksefImportNotes(doc.ksefId),
    expenseCategoryId: options.expenseCategoryId ?? null,
    projectId: options.projectId ?? null,
    costPlaceKind: options.costPlaceKind,
    accountingNote: options.accountingNote?.trim() ?? "",
    vehicleId: options.vehicleId ?? null,
    projectAllocations: options.projectAllocations,
  };
}

export function resolveKsefImportAmountToPayGross(doc: KsefDocument) {
  return resolveAmountToPayGrossFromKsefXml(doc);
}
