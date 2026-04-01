import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { rankCosts, rankIncomes } from "@/lib/bank-import/match-suggestions";

const RANGE_DAYS = 90;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tx = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);

  const start = new Date(tx.bookingDate);
  start.setDate(start.getDate() - RANGE_DAYS);
  const end = new Date(tx.bookingDate);
  end.setDate(end.getDate() + RANGE_DAYS);

  const [costs, incomes] = await Promise.all([
    prisma.costInvoice.findMany({
      where: { documentDate: { gte: start, lte: end } },
      orderBy: { documentDate: "desc" },
      take: 400,
    }),
    prisma.incomeInvoice.findMany({
      where: { issueDate: { gte: start, lte: end } },
      orderBy: { issueDate: "desc" },
      take: 400,
    }),
  ]);

  const t = {
    amount: tx.amount,
    bookingDate: tx.bookingDate,
    description: tx.description,
  };

  return jsonData({
    transaction: {
      id: tx.id,
      amount: tx.amount,
      bookingDate: tx.bookingDate.toISOString(),
      description: tx.description,
      counterpartyName: tx.counterpartyName,
      status: tx.status,
    },
    suggestions: {
      costs: rankCosts(t, costs),
      incomes: rankIncomes(t, incomes),
    },
  });
}
