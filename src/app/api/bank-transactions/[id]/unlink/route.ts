import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";

/** Czyści powiązania z dokumentami i przywraca status NEW (bez usuwania utworzonych kosztów). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tx = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);

  const updated = await prisma.bankTransaction.update({
    where: { id },
    data: {
      status: "NEW",
      matchedInvoiceId: null,
      linkedCostInvoiceId: null,
      createdCostId: null,
    },
  });
  return jsonData(updated);
}
