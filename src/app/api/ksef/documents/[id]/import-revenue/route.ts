import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { importKsefDocumentAsRevenue } from "@/lib/ksef/import-revenue-invoice";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const result = await importKsefDocumentAsRevenue(id);
    return jsonData(result, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import przychodu nie powiódł się.";
    return jsonError(msg, 400);
  }
}
