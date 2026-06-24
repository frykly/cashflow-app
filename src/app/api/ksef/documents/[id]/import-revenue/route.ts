import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { importKsefDocumentAsRevenue } from "@/lib/ksef/import-revenue-invoice";
import { ksefImportRevenueBodySchema } from "@/lib/validation/ksef-import-schemas";
import { ZodError } from "zod";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = ksefImportRevenueBodySchema.parse(body);
    const result = await importKsefDocumentAsRevenue(id, data);
    return jsonData(result, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    const msg = e instanceof Error ? e.message : "Import przychodu nie powiódł się.";
    return jsonError(msg, 400);
  }
}
