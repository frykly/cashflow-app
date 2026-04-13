import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import type { CostInvoice, IncomeInvoice, PlannedFinancialEvent, Project } from "@prisma/client";

export type ProjectDetailsResult = {
  project: Project;
  counts: { income: number; cost: number; planned: number };
  /** Rzeczywiste: tylko faktury. */
  real: {
    incomeNet: number;
    costNet: number;
    netResult: number;
  };
  /** Plan / forecast: pola projektu + aktywne zdarzenia planowane (status PLANNED). */
  forecast: {
    manualPlannedRevenueNet: number;
    manualPlannedCostNet: number;
    plannedEventsIncomeNet: number;
    plannedEventsExpenseNet: number;
    totalPlannedRevenue: number;
    totalPlannedCost: number;
    /** (planPrzychód − faktyczny przychód) − (planKoszt − faktyczny koszt) — reszta do „domknięcia” względem planu. */
    forecastNet: number;
  };
  /** Odchylenia faktur vs łączny plan; trzeci wiersz = wynik rzeczywisty − początkowy bilans planowany. */
  progress: {
    revenueActualVsPlanned: number;
    costActualVsPlanned: number;
    netActualVsForecast: number;
  };
  incomeInvoices: (IncomeInvoice & { incomeCategory: { name: string } | null })[];
  costInvoices: (CostInvoice & { expenseCategory: { name: string } | null })[];
  plannedEvents: (PlannedFinancialEvent & {
    incomeCategory: { name: string } | null;
    expenseCategory: { name: string } | null;
    convertedToIncomeInvoice: { id: string; invoiceNumber: string } | null;
    convertedToCostInvoice: { id: string; documentNumber: string } | null;
  })[];
};

const LIST_TAKE = 250;

export async function getProjectDetails(projectId: string): Promise<ProjectDetailsResult | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const baseIncome = { projectId };
  const baseCost = { projectId };
  const basePlanned = { projectId };

  const [incomeCount, costCount, plannedCount, incomeSumRow, costSumRow, activePlannedForForecast] = await Promise.all([
    prisma.incomeInvoice.count({ where: baseIncome }),
    prisma.costInvoice.count({ where: baseCost }),
    prisma.plannedFinancialEvent.count({ where: basePlanned }),
    prisma.incomeInvoice.aggregate({
      where: baseIncome,
      _sum: { netAmount: true },
    }),
    prisma.costInvoice.aggregate({
      where: baseCost,
      _sum: { netAmount: true },
    }),
    prisma.plannedFinancialEvent.findMany({
      where: { ...basePlanned, status: "PLANNED" },
      select: { type: true, amount: true, amountVat: true },
    }),
  ]);

  let plannedEventsIncomeNet = 0;
  let plannedEventsExpenseNet = 0;
  for (const ev of activePlannedForForecast) {
    const v = decToNumber(ev.amount) + decToNumber(ev.amountVat ?? 0);
    if (ev.type === "INCOME") plannedEventsIncomeNet += v;
    else plannedEventsExpenseNet += v;
  }

  const manualPlannedRevenueNet = project.plannedRevenueNet != null ? decToNumber(project.plannedRevenueNet) : 0;
  const manualPlannedCostNet = project.plannedCostNet != null ? decToNumber(project.plannedCostNet) : 0;
  const totalPlannedRevenue = manualPlannedRevenueNet + plannedEventsIncomeNet;
  const totalPlannedCost = manualPlannedCostNet + plannedEventsExpenseNet;

  const incomeNet = incomeSumRow._sum.netAmount != null ? decToNumber(incomeSumRow._sum.netAmount) : 0;
  const costNet = costSumRow._sum.netAmount != null ? decToNumber(costSumRow._sum.netAmount) : 0;
  const netResult = incomeNet - costNet;

  /** Uwzględnia plan i faktyczne faktury — nie „gubi” już zaksięgowanych kosztów względem planu. */
  const forecastNet = (totalPlannedRevenue - incomeNet) - (totalPlannedCost - costNet);

  const [incomeInvoices, costInvoices, plannedEvents] = await Promise.all([
    prisma.incomeInvoice.findMany({
      where: baseIncome,
      orderBy: { plannedIncomeDate: "desc" },
      take: LIST_TAKE,
      include: { incomeCategory: { select: { name: true } } },
    }),
    prisma.costInvoice.findMany({
      where: baseCost,
      orderBy: { plannedPaymentDate: "desc" },
      take: LIST_TAKE,
      include: { expenseCategory: { select: { name: true } } },
    }),
    prisma.plannedFinancialEvent.findMany({
      where: basePlanned,
      orderBy: { plannedDate: "desc" },
      take: LIST_TAKE,
      include: {
        incomeCategory: { select: { name: true } },
        expenseCategory: { select: { name: true } },
        convertedToIncomeInvoice: { select: { id: true, invoiceNumber: true } },
        convertedToCostInvoice: { select: { id: true, documentNumber: true } },
      },
    }),
  ]);

  return {
    project,
    counts: { income: incomeCount, cost: costCount, planned: plannedCount },
    real: { incomeNet, costNet, netResult },
    forecast: {
      manualPlannedRevenueNet,
      manualPlannedCostNet,
      plannedEventsIncomeNet,
      plannedEventsExpenseNet,
      totalPlannedRevenue,
      totalPlannedCost,
      forecastNet,
    },
    progress: {
      revenueActualVsPlanned: incomeNet - totalPlannedRevenue,
      costActualVsPlanned: costNet - totalPlannedCost,
      netActualVsForecast: netResult - (totalPlannedRevenue - totalPlannedCost),
    },
    incomeInvoices,
    costInvoices,
    plannedEvents,
  };
}
