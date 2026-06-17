import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { importKsefDocumentAsCost } from "@/lib/ksef/import-cost-invoice";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const result = await importKsefDocumentAsCost(id);
    return jsonData(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import kosztu nie powiódł się.";
    return jsonError(msg, 400);
  }
}
