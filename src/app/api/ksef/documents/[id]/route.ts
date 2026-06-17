import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { findProbableCostDuplicate } from "@/lib/ksef/duplicate-match";
import { ksefDocumentToPublicRow } from "@/lib/ksef/document-public-row";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const doc = await prisma.ksefDocument.findUnique({ where: { id } });
  if (!doc) return jsonError("Nie znaleziono dokumentu KSeF.", 404);

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

  return jsonData({
    document: ksefDocumentToPublicRow(doc),
    duplicateCost,
  });
}
