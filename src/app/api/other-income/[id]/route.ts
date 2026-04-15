import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { healBankTransactionLinks } from "@/lib/bank-import/heal-links";
import { serializeOtherIncomeRow } from "@/lib/other-income-api";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.otherIncome.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      bankTransaction: { select: { importId: true } },
    },
  });
  if (!row) return jsonError("Nie znaleziono wpisu", 404);
  return jsonData(serializeOtherIncomeRow(row));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const existing = await prisma.otherIncome.findUnique({ where: { id } });
  if (!existing) return jsonError("Nie znaleziono wpisu", 404);

  await prisma.$transaction(async (trx) => {
    if (existing.bankTransactionId) {
      await trx.bankTransaction.update({
        where: { id: existing.bankTransactionId },
        data: { status: "NEW" },
      });
    }
    await trx.otherIncome.delete({ where: { id } });
  });

  if (existing.bankTransactionId) {
    const tx = await prisma.bankTransaction.findUnique({
      where: { id: existing.bankTransactionId },
      select: { importId: true },
    });
    if (tx) await healBankTransactionLinks(prisma, tx.importId);
  }

  return jsonData({ ok: true });
}
