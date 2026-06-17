import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { applyDuplicateScanToDocument } from "@/lib/ksef/duplicate-match";
import { ksefDocumentToPublicRow } from "@/lib/ksef/import-cost-invoice";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const doc = await prisma.ksefDocument.findUnique({ where: { id } });
  if (!doc) return jsonError("Nie znaleziono dokumentu KSeF.", 404);
  if (doc.workflowStatus === "IMPORTED") {
    return jsonError("Zaimportowany dokument nie może być przywrócony.", 400);
  }

  await prisma.ksefDocument.update({
    where: { id },
    data: {
      workflowStatus: "NEW",
      duplicateOfCostInvoiceId: null,
      duplicateMatchSummary: null,
      rejectedAt: null,
      processedAt: new Date(),
    },
  });

  await applyDuplicateScanToDocument(id);

  const updated = await prisma.ksefDocument.findUnique({ where: { id } });
  if (!updated) return jsonError("Nie znaleziono dokumentu KSeF.", 404);

  return jsonData(ksefDocumentToPublicRow(updated));
}
