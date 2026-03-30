import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import type { CostInvoice, IncomeInvoice, PlannedFinancialEvent, Project } from "@prisma/client";

export type ProjectDetailsResult = {
  project: Project;
  counts: { income: number; cost: number; planned: number };
  sums: { incomeNet: number; costNet: number; netResult: number };
  incomeInvoices: (IncomeInvoice & { incomeCategory: { name: string } | null })[];
  costInvoices: (CostInvoice & { expenseCategory: { name: string } | null })[];
  plannedEvents: (PlannedFinancialEvent & {
    incomeCategory: { name: string } | null;
    expenseCategory: { name: string } | null;
  })[];
};

const LIST_TAKE = 250;

export async function getProjectDetails(projectId: string): Promise<ProjectDetailsResult | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const baseIncome = { projectId };
  const baseCost = { projectId };
  const basePlanned = { projectId };

  const [
    incomeCount,
    costCount,
    plannedCount,
    incomeSumRow,
    costSumRow,
    incomeInvoices,
    costInvoices,
    plannedEvents,
  ] = await Promise.all([
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
      },
    }),
  ]);

  const incomeNet = incomeSumRow._sum.netAmount != null ? decToNumber(incomeSumRow._sum.netAmount) : 0;
  const costNet = costSumRow._sum.netAmount != null ? decToNumber(costSumRow._sum.netAmount) : 0;

  return {
    project,
    counts: { income: incomeCount, cost: costCount, planned: plannedCount },
    sums: { incomeNet, costNet, netResult: incomeNet - costNet },
    incomeInvoices,
    costInvoices,
    plannedEvents,
  };
}
