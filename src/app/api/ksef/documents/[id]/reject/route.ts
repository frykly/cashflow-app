import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { ksefDocumentToPublicRow } from "@/lib/ksef/document-public-row";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const doc = await prisma.ksefDocument.findUnique({ where: { id } });
    if (!doc) return jsonError("Nie znaleziono dokumentu KSeF.", 404);
    if (doc.workflowStatus === "IMPORTED") {
      return jsonError("Zaimportowany dokument nie może być odrzucony.", 400);
    }

    const updated = await prisma.ksefDocument.update({
      where: { id },
      data: {
        workflowStatus: "REJECTED",
        rejectedAt: new Date(),
        processedAt: new Date(),
      },
    });

    return jsonData(ksefDocumentToPublicRow(updated));
  } catch (e) {
    console.error("[ksef/reject]", e);
    return jsonError(
      e instanceof Error ? e.message : "Nie udało się odrzucić dokumentu KSeF.",
      500,
    );
  }
}
