import { prisma } from "@/lib/db";
import { jsonError } from "@/lib/api/errors";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, paymentId } = await ctx.params;
  const p = await prisma.incomeInvoicePayment.findFirst({
    where: { id: paymentId, incomeInvoiceId: id },
  });
  if (!p) return jsonError("Nie znaleziono", 404);
  await prisma.incomeInvoicePayment.delete({ where: { id: paymentId } });
  await syncIncomeInvoiceStatus(id);
  return new NextResponse(null, { status: 204 });
}
