import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { findProbableCostDuplicate } from "@/lib/ksef/duplicate-match";
import { ksefDocumentToPublicRow } from "@/lib/ksef/import-cost-invoice";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const doc = await prisma.ksefDocument.findUnique({ where: { id } });
  if (!doc) return jsonError("Nie znaleziono dokumentu KSeF.", 404);
  if (doc.workflowStatus === "IMPORTED") {
    return jsonError("Zaimportowany dokument nie może być oznaczony jako duplikat.", 400);
  }

  const match =
    doc.duplicateOfCostInvoiceId
      ? {
          id: doc.duplicateOfCostInvoiceId,
          summary: doc.duplicateMatchSummary ?? "",
        }
      : await findProbableCostDuplicate({
          invoiceNumber: doc.invoiceNumber,
          sellerTaxId: doc.sellerTaxId,
          sellerName: doc.sellerName,
          grossAmount: doc.grossAmount,
        });

  const summary = match?.summary
    ? match.summary
    : doc.duplicateMatchSummary ?? "Oznaczono ręcznie jako duplikat";

  const updated = await prisma.ksefDocument.update({
    where: { id },
    data: {
      workflowStatus: "PROBABLE_DUPLICATE",
      duplicateOfCostInvoiceId: match?.id ?? doc.duplicateOfCostInvoiceId ?? null,
      duplicateMatchSummary: summary,
      processedAt: new Date(),
    },
  });

  return jsonData(ksefDocumentToPublicRow(updated));
}
