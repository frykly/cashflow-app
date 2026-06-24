import type { CostInvoice, KsefDocument } from "@prisma/client";
import { COST_PAYMENT_AMOUNT_EPS, costEffectivePaymentGross, costHasPaymentAmountSplit } from "@/lib/cashflow/cost-payment-amount";
import { parseFaInvoiceXml } from "./fa-xml-parser";

export type KsefPaymentAmountFields = {
  invoiceGrossAmount: string;
  amountToPay: string;
  additionalChargesTotal: string | null;
  hasPaymentAmountSplit: boolean;
};

export function resolveKsefDocumentPaymentAmounts(
  doc: Pick<KsefDocument, "grossAmount" | "xmlFetchStatus" | "xmlPayload">,
  linkedCost?: Pick<CostInvoice, "grossAmount" | "amountToPayGross"> | null,
): KsefPaymentAmountFields {
  const metaGross = doc.grossAmount.toString();

  if (linkedCost) {
    const invoiceGross = linkedCost.grossAmount.toString();
    const toPay = costEffectivePaymentGross(linkedCost).toFixed(2);
    const split = costHasPaymentAmountSplit(linkedCost);
    const charges =
      split && linkedCost.amountToPayGross != null
        ? Math.max(0, costEffectivePaymentGross(linkedCost) - Number(invoiceGross)).toFixed(2)
        : null;
    return {
      invoiceGrossAmount: invoiceGross,
      amountToPay: toPay,
      additionalChargesTotal: charges,
      hasPaymentAmountSplit: split,
    };
  }

  if (doc.xmlFetchStatus === "OK" && doc.xmlPayload?.trim()) {
    try {
      const xml = parseFaInvoiceXml(doc.xmlPayload);
      const invoiceGross = xml.grossAmount ?? metaGross;
      const toPay = xml.amountToPay ?? invoiceGross;
      const split =
        xml.amountToPay != null &&
        invoiceGross != null &&
        Math.abs(Number(xml.amountToPay) - Number(invoiceGross)) > COST_PAYMENT_AMOUNT_EPS;
      return {
        invoiceGrossAmount: invoiceGross,
        amountToPay: toPay,
        additionalChargesTotal: xml.additionalChargesTotal,
        hasPaymentAmountSplit: split,
      };
    } catch {
      // metadata fallback
    }
  }

  return {
    invoiceGrossAmount: metaGross,
    amountToPay: metaGross,
    additionalChargesTotal: null,
    hasPaymentAmountSplit: false,
  };
}

export function resolveAmountToPayGrossFromKsefXml(doc: Pick<KsefDocument, "xmlFetchStatus" | "xmlPayload">): number | null {
  if (doc.xmlFetchStatus !== "OK" || !doc.xmlPayload?.trim()) return null;
  try {
    const xml = parseFaInvoiceXml(doc.xmlPayload);
    if (!xml.amountToPay || !xml.grossAmount) return null;
    if (Math.abs(Number(xml.amountToPay) - Number(xml.grossAmount)) <= COST_PAYMENT_AMOUNT_EPS) return null;
    return Number(xml.amountToPay);
  } catch {
    return null;
  }
}
