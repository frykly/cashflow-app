import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { buildKsefDocumentDetailResponse } from "@/lib/ksef/ksef-document-detail";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const detail = await buildKsefDocumentDetailResponse(id);
  if (!detail) return jsonError("Nie znaleziono dokumentu KSeF.", 404);
  return jsonData(detail);
}
