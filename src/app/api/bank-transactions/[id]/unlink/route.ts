import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { syncCostInvoiceStatus, syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";

/**
 * Odłącza wiersz bankowy od dokumentów.
 * Usuwa płatności utworzone wyłącznie z tego dopasowania (bankTransactionId),
 * potem przelicza statusy faktur.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bankTxId } = await ctx.params;
  const tx = await prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);

  const [incPayments, costPayments] = await Promise.all([
    prisma.incomeInvoicePayment.findMany({ where: { bankTransactionId: bankTxId } }),
    prisma.costInvoicePayment.findMany({ where: { bankTransactionId: bankTxId } }),
  ]);

  const incomeIds = [...new Set(incPayments.map((p) => p.incomeInvoiceId))];
  const costIds = [...new Set(costPayments.map((p) => p.costInvoiceId))];

  await prisma.$transaction(async (trx) => {
    await trx.incomeInvoicePayment.deleteMany({ where: { bankTransactionId: bankTxId } });
    await trx.costInvoicePayment.deleteMany({ where: { bankTransactionId: bankTxId } });
    await trx.bankTransaction.update({
      where: { id: bankTxId },
      data: {
        status: "NEW",
        matchedInvoiceId: null,
        linkedCostInvoiceId: null,
        createdCostId: null,
      },
    });
  });

  for (const iid of incomeIds) await syncIncomeInvoiceStatus(iid);
  for (const cid of costIds) await syncCostInvoiceStatus(cid);

  const updated = await prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
  return jsonData(updated);
}
