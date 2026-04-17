import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { rankCosts, rankIncomes, rankPlannedExpenses } from "@/lib/bank-import/match-suggestions";

const RANGE_DAYS = 90;
/** Planowane koszty mogą mieć datę planu dalej od daty operacji bankowej — szersze okno niż dla faktur. */
const PLANNED_RANGE_DAYS = 400;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tx = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);

  const start = new Date(tx.bookingDate);
  start.setDate(start.getDate() - RANGE_DAYS);
  const end = new Date(tx.bookingDate);
  end.setDate(end.getDate() + RANGE_DAYS);

  const plannedStart = new Date(tx.bookingDate);
  plannedStart.setDate(plannedStart.getDate() - PLANNED_RANGE_DAYS);
  const plannedEnd = new Date(tx.bookingDate);
  plannedEnd.setDate(plannedEnd.getDate() + PLANNED_RANGE_DAYS);

  const [costRows, incomeRows, plannedExpenseRows] = await Promise.all([
    prisma.costInvoice.findMany({
      where: { documentDate: { gte: start, lte: end } },
      orderBy: { documentDate: "desc" },
      take: 400,
      include: { payments: { select: { amountGross: true } } },
    }),
    prisma.incomeInvoice.findMany({
      where: { issueDate: { gte: start, lte: end } },
      orderBy: { issueDate: "desc" },
      take: 400,
      include: {
        projectAllocations: { select: { projectId: true, grossAmount: true } },
        payments: { select: { amountGross: true } },
      },
    }),
    prisma.plannedFinancialEvent.findMany({
      where: {
        type: "EXPENSE",
        status: "PLANNED",
        plannedDate: { gte: plannedStart, lte: plannedEnd },
      },
      orderBy: { plannedDate: "desc" },
      take: 500,
      include: {
        project: { select: { name: true, code: true } },
        expenseCategory: { select: { name: true } },
      },
    }),
  ]);

  const t = {
    amount: tx.amount,
    bookingDate: tx.bookingDate,
    description: tx.description,
  };

  const preferPrimaryDocument = tx.amount > 0 ? "income" : "cost";

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
      costs: rankCosts(t, costRows, 200, { demote: preferPrimaryDocument === "income" }),
      incomes: rankIncomes(t, incomeRows, 200, { demote: preferPrimaryDocument === "cost" }),
      plannedExpenses: rankPlannedExpenses(t, plannedExpenseRows, 200, {
        demote: preferPrimaryDocument === "income",
      }),
      preferPrimaryDocument,
    },
  });
}
