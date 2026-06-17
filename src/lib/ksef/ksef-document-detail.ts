import { prisma } from "@/lib/db";
import {
  findProbableCostDuplicate,
  findProbableIncomeDuplicate,
} from "@/lib/ksef/duplicate-match";
import { ksefDocumentToPublicRow } from "@/lib/ksef/document-public-row";
import { buildKsefInvoicePreview } from "@/lib/ksef/invoice-preview";
import { parseRawPayloadJson } from "@/lib/ksef/raw-payload-display";

export async function buildKsefDocumentDetailResponse(documentId: string) {
  const doc = await prisma.ksefDocument.findUnique({ where: { id: documentId } });
  if (!doc) return null;

  let duplicateCost: { id: string; documentNumber: string; supplier: string; grossAmount: string } | null =
    null;
  if (doc.duplicateOfCostInvoiceId) {
    const c = await prisma.costInvoice.findUnique({
      where: { id: doc.duplicateOfCostInvoiceId },
      select: { id: true, documentNumber: true, supplier: true, grossAmount: true },
    });
    if (c) {
      duplicateCost = {
        id: c.id,
        documentNumber: c.documentNumber,
        supplier: c.supplier,
        grossAmount: c.grossAmount.toString(),
      };
    }
  } else if (doc.documentDirection === "PURCHASE" && doc.workflowStatus !== "IMPORTED") {
    const match = await findProbableCostDuplicate({
      invoiceNumber: doc.invoiceNumber,
      sellerTaxId: doc.sellerTaxId,
      sellerName: doc.sellerName,
      grossAmount: doc.grossAmount,
    });
    if (match) {
      duplicateCost = {
        id: match.id,
        documentNumber: match.documentNumber,
        supplier: match.supplier,
        grossAmount: match.grossAmount,
      };
    }
  }

  let duplicateIncome: {
    id: string;
    invoiceNumber: string;
    contractor: string;
    grossAmount: string;
  } | null = null;
  if (doc.duplicateOfIncomeInvoiceId) {
    const inv = await prisma.incomeInvoice.findUnique({
      where: { id: doc.duplicateOfIncomeInvoiceId },
      select: { id: true, invoiceNumber: true, contractor: true, grossAmount: true },
    });
    if (inv) {
      duplicateIncome = {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        contractor: inv.contractor,
        grossAmount: inv.grossAmount.toString(),
      };
    }
  } else if (doc.documentDirection === "SALE" && doc.workflowStatus !== "IMPORTED") {
    const match = await findProbableIncomeDuplicate({
      invoiceNumber: doc.invoiceNumber,
      buyerTaxId: doc.buyerTaxId,
      buyerName: doc.buyerName,
      grossAmount: doc.grossAmount,
      issueDate: doc.issueDate,
    });
    if (match) {
      duplicateIncome = {
        id: match.id,
        invoiceNumber: match.invoiceNumber,
        contractor: match.contractor,
        grossAmount: match.grossAmount,
      };
    }
  }

  return {
    document: ksefDocumentToPublicRow(doc),
    preview: buildKsefInvoicePreview(doc),
    rawPayload: parseRawPayloadJson(doc.rawPayload),
    xmlAvailable: doc.xmlFetchStatus === "OK" && Boolean(doc.xmlPayload?.trim()),
    xmlPayload:
      doc.xmlFetchStatus === "OK" && doc.xmlPayload?.trim() ? doc.xmlPayload : null,
    duplicateCost,
    duplicateIncome,
  };
}
