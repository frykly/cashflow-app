import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import type { CostInvoice, IncomeInvoice, PlannedFinancialEvent, Project } from "@prisma/client";

export type ProjectDetailsResult = {
  project: Project;
  counts: { income: number; cost: number; planned: number };
  /** Rzeczywiste: tylko faktury (netto przypisane do projektu — alokacje lub legacy). */
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
    forecastNet: number;
  };
  progress: {
    revenueActualVsPlanned: number;
    costActualVsPlanned: number;
    netActualVsForecast: number;
  };
  incomeInvoices: (IncomeInvoice & {
    incomeCategory: { name: string } | null;
    projectAllocations?: { netAmount: unknown; grossAmount: unknown }[];
  })[];
  costInvoices: (CostInvoice & {
    expenseCategory: { name: string } | null;
    projectAllocations?: { netAmount: unknown; grossAmount: unknown }[];
  })[];
  plannedEvents: (PlannedFinancialEvent & {
    incomeCategory: { name: string } | null;
    expenseCategory: { name: string } | null;
    convertedToIncomeInvoice: { id: string; invoiceNumber: string } | null;
    convertedToCostInvoice: { id: string; documentNumber: string } | null;
    projectAllocations?: { amount: unknown; amountVat: unknown }[];
  })[];
};

const LIST_TAKE = 250;

const linkedToProject = (projectId: string) => ({
  OR: [{ projectId }, { projectAllocations: { some: { projectId } } }],
});

export async function getProjectDetails(projectId: string): Promise<ProjectDetailsResult | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const whereLinked = linkedToProject(projectId);

  const [incomeCount, costCount, plannedCount, incomeNetTotal, costNetTotal, plannedEventsForForecast] =
    await Promise.all([
      prisma.incomeInvoice.count({ where: whereLinked }),
      prisma.costInvoice.count({ where: whereLinked }),
      prisma.plannedFinancialEvent.count({ where: whereLinked }),
      sumIncomeNetForProject(projectId),
      sumCostNetForProject(projectId),
      prisma.plannedFinancialEvent.findMany({
        where: { AND: [whereLinked, { status: "PLANNED" }] },
        select: {
          type: true,
          amount: true,
          amountVat: true,
          projectId: true,
          projectAllocations: { where: { projectId }, select: { amount: true, amountVat: true } },
        },
      }),
    ]);

  let plannedEventsIncomeNet = 0;
  let plannedEventsExpenseNet = 0;
  for (const ev of plannedEventsForForecast) {
    let v = 0;
    if (ev.projectAllocations.length > 0) {
      for (const a of ev.projectAllocations) {
        v += decToNumber(a.amount) + decToNumber(a.amountVat ?? 0);
      }
    } else if (ev.projectId === projectId) {
      v = decToNumber(ev.amount) + decToNumber(ev.amountVat ?? 0);
    }
    if (ev.type === "INCOME") plannedEventsIncomeNet += v;
    else plannedEventsExpenseNet += v;
  }

  const manualPlannedRevenueNet = project.plannedRevenueNet != null ? decToNumber(project.plannedRevenueNet) : 0;
  const manualPlannedCostNet = project.plannedCostNet != null ? decToNumber(project.plannedCostNet) : 0;
  const totalPlannedRevenue = manualPlannedRevenueNet + plannedEventsIncomeNet;
  const totalPlannedCost = manualPlannedCostNet + plannedEventsExpenseNet;

  const incomeNet = incomeNetTotal;
  const costNet = costNetTotal;
  const netResult = incomeNet - costNet;

  const forecastNet = totalPlannedRevenue - incomeNet - (totalPlannedCost - costNet);

  const [incomeInvoices, costInvoices, plannedEvents] = await Promise.all([
    prisma.incomeInvoice.findMany({
      where: whereLinked,
      orderBy: { plannedIncomeDate: "desc" },
      take: LIST_TAKE,
      include: {
        incomeCategory: { select: { name: true } },
        projectAllocations: { where: { projectId }, select: { netAmount: true, grossAmount: true } },
      },
    }),
    prisma.costInvoice.findMany({
      where: whereLinked,
      orderBy: { plannedPaymentDate: "desc" },
      take: LIST_TAKE,
      include: {
        expenseCategory: { select: { name: true } },
        projectAllocations: { where: { projectId }, select: { netAmount: true, grossAmount: true } },
      },
    }),
    prisma.plannedFinancialEvent.findMany({
      where: whereLinked,
      orderBy: { plannedDate: "desc" },
      take: LIST_TAKE,
      include: {
        incomeCategory: { select: { name: true } },
        expenseCategory: { select: { name: true } },
        convertedToIncomeInvoice: { select: { id: true, invoiceNumber: true } },
        convertedToCostInvoice: { select: { id: true, documentNumber: true } },
        projectAllocations: { where: { projectId }, select: { amount: true, amountVat: true } },
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

async function sumIncomeNetForProject(projectId: string): Promise<number> {
  const [alloc, legacy] = await Promise.all([
    prisma.incomeInvoiceProjectAllocation.aggregate({
      where: { projectId },
      _sum: { netAmount: true },
    }),
    prisma.incomeInvoice.aggregate({
      where: { projectId, projectAllocations: { none: {} } },
      _sum: { netAmount: true },
    }),
  ]);
  return decToNumber(alloc._sum.netAmount ?? 0) + decToNumber(legacy._sum.netAmount ?? 0);
}

async function sumCostNetForProject(projectId: string): Promise<number> {
  const [alloc, legacy] = await Promise.all([
    prisma.costInvoiceProjectAllocation.aggregate({
      where: { projectId },
      _sum: { netAmount: true },
    }),
    prisma.costInvoice.aggregate({
      where: { projectId, projectAllocations: { none: {} } },
      _sum: { netAmount: true },
    }),
  ]);
  return decToNumber(alloc._sum.netAmount ?? 0) + decToNumber(legacy._sum.netAmount ?? 0);
}
