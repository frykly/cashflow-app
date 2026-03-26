import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api/errors";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, paymentId } = await ctx.params;
  const p = await prisma.costInvoicePayment.findFirst({
    where: { id: paymentId, costInvoiceId: id },
  });
  if (!p) return jsonError("Nie znaleziono", 404);
  await prisma.costInvoicePayment.delete({ where: { id: paymentId } });
  await syncCostInvoiceStatus(id);
  return new NextResponse(null, { status: 204 });
}
