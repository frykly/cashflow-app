import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import {
  activeIncomePlanRows,
  buildDailyForecast,
  collectMovements,
  costInvoiceMap,
  currentBalances,
  mainAccountNegativeInForecast,
  plannedMainFlowsInWindow,
  remainderSplitByIncomePlan,
} from "@/lib/cashflow/forecast";
import { breakdownExpenseByCategory30, breakdownIncomeByCategory30 } from "@/lib/cashflow/category-breakdown";
import {
  costPaymentDeltas,
  costRemainingGross,
  incomeRemainingMainVat,
  isCostFullyPaid,
  isIncomeFullyPaid,
  PAY_EPS,
} from "@/lib/cashflow/settlement";
import { isCostInvoiceOverdue, isIncomeInvoiceOverdue, isPlannedEventOverdue } from "@/lib/cashflow/overdue";
import { addDays, isBefore, startOfDay } from "date-fns";
import { jsonData } from "@/lib/api/json-response";
import type {
  IncomeInvoice,
  IncomeInvoicePayment,
  IncomeInvoicePlannedPayment,
  PlannedFinancialEvent,
} from "@prisma/client";

function incomeUpcomingSlices(
  i: IncomeInvoice & { payments: IncomeInvoicePayment[]; plannedPayments?: IncomeInvoicePlannedPayment[] },
  now: Date,
  horizonEnd: Date,
): { id: string; date: string; label: string; mainAmount: number }[] {
  if (isIncomeFullyPaid(i, i.payments)) return [];
  const start = startOfDay(now);
  const rem = incomeRemainingMainVat(i, i.payments);
  const rows = activeIncomePlanRows(i);
  if (rows.length > 0) {
    const splits = remainderSplitByIncomePlan(i, i.payments, rows);
    return splits
      .filter((s) => s.main > PAY_EPS && !isBefore(s.dueDate, start) && isBefore(s.dueDate, horizonEnd))
      .map((s) => ({
        id: `${i.id}-plan-${s.idx}`,
        date: s.dueDate.toISOString(),
        label: `${i.invoiceNumber} — ${i.contractor} (plan ${s.idx + 1})`,
        mainAmount: s.main,
      }));
  }
  if (rem.remMain <= PAY_EPS) return [];
  if (isBefore(i.plannedIncomeDate, start) || !isBefore(i.plannedIncomeDate, horizonEnd)) return [];
  return [
    {
      id: i.id,
      date: i.plannedIncomeDate.toISOString(),
      label: `${i.invoiceNumber} — ${i.contractor}`,
      mainAmount: rem.remMain,
    },
  ];
}

function plannedLiquidity(ev: PlannedFinancialEvent): number {
  return decToNumber(ev.amount) + decToNumber(ev.amountVat ?? 0);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const warnDays = Math.min(365, Math.max(1, Number(searchParams.get("warnDays") ?? "90") || 90));

  const [settings, incomes, costs, events, otherIncomes, incomeCats, expenseCats] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.incomeInvoice.findMany({
      include: { payments: true, plannedPayments: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.costInvoice.findMany({ include: { payments: true } }),
    prisma.plannedFinancialEvent.findMany(),
    prisma.otherIncome.findMany(),
    prisma.incomeCategory.findMany(),
    prisma.expenseCategory.findMany(),
  ]);

  const incomeName = (id: string | null) =>
    id ? (incomeCats.find((c) => c.id === id)?.name ?? "Kategoria") : "Bez kategorii";
  const expenseName = (id: string | null) =>
    id ? (expenseCats.find((c) => c.id === id)?.name ?? "Kategoria") : "Bez kategorii";

  const movements = collectMovements(incomes, costs, events, otherIncomes);
  const costMap = costInvoiceMap(costs);
  const balances = currentBalances(movements, settings, new Date(), costMap);
  const planned30 = plannedMainFlowsInWindow(incomes, costs, events, 30);
  const planned7 = plannedMainFlowsInWindow(incomes, costs, events, 7);

  const now = new Date();
  const from = startOfDay(now);
  const to = addDays(from, warnDays);
  const forecastRows = buildDailyForecast(movements, settings, from, to, costMap);
  const mainNegativeForecast = mainAccountNegativeInForecast(forecastRows);

  const horizon30 = addDays(startOfDay(now), 30);
  const horizon7 = addDays(startOfDay(now), 7);

  const incomeCandidates = incomes.flatMap((i) =>
    incomeUpcomingSlices(i, now, horizon30).map((x) => ({ kind: "income" as const, ...x })),
  );

  const plannedIncomeCandidates = events
    .filter((e) => e.type === "INCOME" && e.status === "PLANNED")
    .filter((e) => e.plannedDate >= startOfDay(now) && e.plannedDate < horizon30)
    .map((e) => ({
      kind: "planned" as const,
      id: e.id,
      date: e.plannedDate.toISOString(),
      label: e.title,
      mainAmount: plannedLiquidity(e),
    }));

  const upcomingInflows = [...incomeCandidates, ...plannedIncomeCandidates]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 15);

  const costCandidates = costs
    .filter((c) => !isCostFullyPaid(c, c.payments))
    .filter((c) => c.plannedPaymentDate >= startOfDay(now) && c.plannedPaymentDate < horizon30)
    .map((c) => ({
      kind: "cost" as const,
      id: c.id,
      date: c.plannedPaymentDate.toISOString(),
      label: `${c.documentNumber} — ${c.supplier}`,
      mainAmount: costPaymentDeltas(c, costRemainingGross(c, c.payments)).main,
    }));

  const plannedExpenseCandidates = events
    .filter((e) => e.type === "EXPENSE" && e.status === "PLANNED")
    .filter((e) => e.plannedDate >= startOfDay(now) && e.plannedDate < horizon30)
    .map((e) => ({
      kind: "planned" as const,
      id: e.id,
      date: e.plannedDate.toISOString(),
      label: e.title,
      mainAmount: -plannedLiquidity(e),
    }));

  const upcomingOutflows = [...costCandidates, ...plannedExpenseCandidates]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 15);

  const incomeCandidates7 = incomes.flatMap((i) =>
    incomeUpcomingSlices(i, now, horizon7).map((x) => ({ kind: "income" as const, ...x })),
  );

  const plannedIncome7 = events
    .filter((e) => e.type === "INCOME" && e.status === "PLANNED")
    .filter((e) => e.plannedDate >= startOfDay(now) && e.plannedDate < horizon7)
    .map((e) => ({
      kind: "planned" as const,
      id: e.id,
      date: e.plannedDate.toISOString(),
      label: e.title,
      mainAmount: plannedLiquidity(e),
    }));

  const upcomingInflows7 = [...incomeCandidates7, ...plannedIncome7]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 12);

  const costCandidates7 = costs
    .filter((c) => !isCostFullyPaid(c, c.payments))
    .filter((c) => c.plannedPaymentDate >= startOfDay(now) && c.plannedPaymentDate < horizon7)
    .map((c) => ({
      kind: "cost" as const,
      id: c.id,
      date: c.plannedPaymentDate.toISOString(),
      label: `${c.documentNumber} — ${c.supplier}`,
      mainAmount: costPaymentDeltas(c, costRemainingGross(c, c.payments)).main,
    }));

  const plannedExpense7 = events
    .filter((e) => e.type === "EXPENSE" && e.status === "PLANNED")
    .filter((e) => e.plannedDate >= startOfDay(now) && e.plannedDate < horizon7)
    .map((e) => ({
      kind: "planned" as const,
      id: e.id,
      date: e.plannedDate.toISOString(),
      label: e.title,
      mainAmount: -plannedLiquidity(e),
    }));

  const upcomingOutflows7 = [...costCandidates7, ...plannedExpense7]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 12);

  const overdueIncomes = incomes
    .filter((i) => isIncomeInvoiceOverdue(i, i.payments, now))
    .map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      contractor: i.contractor,
      plannedIncomeDate: i.plannedIncomeDate.toISOString(),
      paymentDueDate: i.paymentDueDate.toISOString(),
      label: `${i.invoiceNumber} — ${i.contractor}`,
    }));

  const overdueCosts = costs
    .filter((c) => isCostInvoiceOverdue(c, c.payments, now))
    .map((c) => ({
      id: c.id,
      documentNumber: c.documentNumber,
      supplier: c.supplier,
      plannedPaymentDate: c.plannedPaymentDate.toISOString(),
      paymentDueDate: c.paymentDueDate.toISOString(),
      label: `${c.documentNumber} — ${c.supplier}`,
    }));

  const overduePlanned = events
    .filter((e) => isPlannedEventOverdue(e, now))
    .map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      plannedDate: e.plannedDate.toISOString(),
      label: e.title,
    }));

  const overdueCount = overdueIncomes.length + overdueCosts.length + overduePlanned.length;

  const categoryIncome30 = breakdownIncomeByCategory30(incomes, events, incomeName, now);
  const categoryExpense30 = breakdownExpenseByCategory30(costs, events, expenseName, now);

  return jsonData({
    balances,
    planned30,
    planned7,
    upcomingInflows,
    upcomingOutflows,
    upcomingInflows7,
    upcomingOutflows7,
    mainNegativeForecast,
    warningHorizonDays: warnDays,
    overdue: {
      count: overdueCount,
      incomes: overdueIncomes,
      costs: overdueCosts,
      planned: overduePlanned,
    },
    categoryBreakdown30: {
      income: categoryIncome30,
      expense: categoryExpense30,
    },
  });
}
