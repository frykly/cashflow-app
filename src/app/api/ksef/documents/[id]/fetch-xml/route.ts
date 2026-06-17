import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { fetchAndCacheKsefDocumentXml } from "@/lib/ksef/fetch-invoice-xml";
import { buildKsefDocumentDetailResponse } from "@/lib/ksef/ksef-document-detail";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    let force = false;
    try {
      const body = (await req.json()) as { force?: boolean };
      force = body.force === true;
    } catch {
      /* empty body */
    }
    const result = await fetchAndCacheKsefDocumentXml(id, { force });
    const detail = await buildKsefDocumentDetailResponse(id);
    if (!detail) return jsonError("Nie znaleziono dokumentu KSeF.", 404);
    return jsonData({ ...detail, fetchResult: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Nie udało się pobrać XML faktury z KSeF.";
    return jsonError(msg, 400);
  }
}
