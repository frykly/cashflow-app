import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { ksefDocumentToPublicRow } from "@/lib/ksef/document-public-row";
import { undoKsefDocumentImport } from "@/lib/ksef/undo-import";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const result = await undoKsefDocumentImport(id);
    if (!result.ok) {
      return jsonError(result.reasons.join(" "), 400);
    }

    const updated = await prisma.ksefDocument.findUnique({ where: { id } });
    if (!updated) return jsonError("Nie znaleziono dokumentu KSeF.", 404);

    return jsonData(ksefDocumentToPublicRow(updated));
  } catch (e) {
    console.error("[ksef/undo-import]", e);
    return jsonError(
      e instanceof Error ? e.message : "Nie udało się cofnąć importu.",
      500,
    );
  }
}
