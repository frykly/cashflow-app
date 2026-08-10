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

function resolveAmountToPayFromOptions(
  doc: KsefDocument,
  options: KsefImportCostBody,
): number | null {
  if (options.amountToPayGross === null) return null;
  if (options.amountToPayGross != null && options.amountToPayGross !== "") {
    const n = Number(String(options.amountToPayGross));
    return Number.isFinite(n) ? n : null;
  }
  return resolveAmountToPayGrossFromKsefXml(doc);
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

  const base: Record<string, unknown> = {
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
    paid: options.paid ?? false,
    actualPaymentDate: options.actualPaymentDate ?? null,
    paymentSource: options.paymentSource ?? "MAIN",
    notes: options.notes?.trim() || ksefImportNotes(doc.ksefId),
    expenseCategoryId: options.expenseCategoryId ?? null,
    projectId: options.projectId ?? null,
    costPlaceKind: options.costPlaceKind,
    accountingNote: options.accountingNote?.trim() ?? "",
    vehicleId: options.vehicleId ?? null,
    projectAllocations: options.projectAllocations,
  };

  if (options.documentNumber != null) base.documentNumber = options.documentNumber.trim();
  if (options.supplier != null) base.supplier = options.supplier.trim();
  if (options.description != null) base.description = options.description.trim();
  if (options.vatRate != null) base.vatRate = options.vatRate;
  if (options.vatOnly != null) base.vatOnly = options.vatOnly;
  if (options.netAmount != null) base.netAmount = options.netAmount;
  if (options.vatAmount != null) base.vatAmount = options.vatAmount;
  if (options.grossAmount != null) base.grossAmount = options.grossAmount;
  if (options.documentDate != null) base.documentDate = options.documentDate;
  if (options.paymentDueDate != null) base.paymentDueDate = options.paymentDueDate;
  if (options.plannedPaymentDate != null) base.plannedPaymentDate = options.plannedPaymentDate;
  if (options.status != null) base.status = options.status;
  if (options.paid != null) base.paid = options.paid;
  if (options.actualPaymentDate !== undefined) base.actualPaymentDate = options.actualPaymentDate;
  if (options.paymentSource != null) base.paymentSource = options.paymentSource;
  if (options.notes != null) base.notes = options.notes.trim();
  if (options.expenseCategoryId !== undefined) base.expenseCategoryId = options.expenseCategoryId;
  if (options.projectId !== undefined) base.projectId = options.projectId;
  if (options.costPlaceKind != null) base.costPlaceKind = options.costPlaceKind;
  if (options.accountingNote != null) base.accountingNote = options.accountingNote.trim();
  if (options.vehicleId !== undefined) base.vehicleId = options.vehicleId;
  if (options.projectAllocations != null) base.projectAllocations = options.projectAllocations;

  return base;
}

export function resolveKsefImportAmountToPayGross(
  doc: KsefDocument,
  options?: KsefImportCostBody,
): number | null {
  if (options) return resolveAmountToPayFromOptions(doc, options);
  return resolveAmountToPayGrossFromKsefXml(doc);
}
