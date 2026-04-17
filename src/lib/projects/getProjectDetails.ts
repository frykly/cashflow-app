import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import type { CostInvoice, IncomeInvoice, PlannedFinancialEvent, Project } from "@prisma/client";
import {
  computeProjectBalanceKpis,
  costNetPaidForProject,
  costNetRemainingForProject,
  incomeMainReceivedForProject,
  incomeNetRemainingForProject,
} from "@/lib/projects/project-balance";

const LIST_TAKE = 250;

const linkedToProject = (projectId: string) => ({
  OR: [{ projectId }, { projectAllocations: { some: { projectId } } }],
});

export type IncomeInvoiceRowExtra = {
  netSlice: number;
  mainReceived: number;
  netRemaining: number;
};

export type CostInvoiceRowExtra = {
  netSlice: number;
  netPaid: number;
  netRemaining: number;
};

export type PlannedEventRowExtra = {
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
};

export type ProjectDetailsResult = {
  project: Project;
  counts: { income: number; cost: number; planned: number };
  balance: ReturnType<typeof computeProjectBalanceKpis>;
  incomeInvoices: (IncomeInvoice & {
    incomeCategory: { name: string } | null;
    projectAllocations: { netAmount: unknown; grossAmount: unknown; projectId: string }[];
    payments: {
      amountGross: unknown;
      allocatedMainAmount: unknown;
      allocatedVatAmount: unknown;
      projectAllocations: { projectId: string; grossAmount: unknown }[];
    }[];
    row?: IncomeInvoiceRowExtra;
  })[];
  costInvoices: (CostInvoice & {
    expenseCategory: { name: string } | null;
    projectAllocations: { netAmount: unknown; grossAmount: unknown; projectId: string }[];
    payments: { amountGross: unknown }[];
    row?: CostInvoiceRowExtra;
  })[];
  plannedEvents: (PlannedFinancialEvent & {
    incomeCategory: { name: string } | null;
    expenseCategory: { name: string } | null;
    convertedToIncomeInvoice: { id: string; invoiceNumber: string } | null;
    convertedToCostInvoice: { id: string; documentNumber: string } | null;
    projectAllocations: { amount: unknown; amountVat: unknown; projectId: string }[];
    row?: PlannedEventRowExtra;
  })[];
};

export async function getProjectDetails(projectId: string): Promise<ProjectDetailsResult | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const whereLinked = linkedToProject(projectId);

  const [
    incomeCount,
    costCount,
    plannedCount,
    incomeInvoicesAll,
    costInvoicesAll,
    plannedEventsAll,
  ] = await Promise.all([
    prisma.incomeInvoice.count({ where: whereLinked }),
    prisma.costInvoice.count({ where: whereLinked }),
    prisma.plannedFinancialEvent.count({ where: whereLinked }),
    prisma.incomeInvoice.findMany({
      where: whereLinked,
      orderBy: { plannedIncomeDate: "desc" },
      include: {
        incomeCategory: { select: { name: true } },
        projectAllocations: { select: { projectId: true, netAmount: true, grossAmount: true } },
        payments: {
          include: {
            projectAllocations: { select: { projectId: true, grossAmount: true } },
          },
        },
      },
    }),
    prisma.costInvoice.findMany({
      where: whereLinked,
      orderBy: { plannedPaymentDate: "desc" },
      include: {
        expenseCategory: { select: { name: true } },
        projectAllocations: { select: { projectId: true, netAmount: true, grossAmount: true } },
        payments: true,
      },
    }),
    prisma.plannedFinancialEvent.findMany({
      where: whereLinked,
      orderBy: { plannedDate: "desc" },
      include: {
        incomeCategory: { select: { name: true } },
        expenseCategory: { select: { name: true } },
        convertedToIncomeInvoice: { select: { id: true, invoiceNumber: true } },
        convertedToCostInvoice: { select: { id: true, documentNumber: true } },
        projectAllocations: { select: { projectId: true, amount: true, amountVat: true } },
      },
    }),
  ]);

  const balance = computeProjectBalanceKpis(
    projectId,
    project.plannedRevenueNet,
    project.plannedCostNet,
    incomeInvoicesAll as Parameters<typeof computeProjectBalanceKpis>[3],
    costInvoicesAll as Parameters<typeof computeProjectBalanceKpis>[4],
    plannedEventsAll as Parameters<typeof computeProjectBalanceKpis>[5],
  );

  const incomeInvoices = incomeInvoicesAll.slice(0, LIST_TAKE).map((inv) => {
    const netSlice = incomeNetSliceForRow(inv, projectId);
    return {
      ...inv,
      row: {
        netSlice,
        mainReceived: incomeMainReceivedForProject(inv as never, projectId),
        netRemaining: incomeNetRemainingForProject(inv as never, projectId),
      },
    };
  });

  const costInvoices = costInvoicesAll.slice(0, LIST_TAKE).map((inv) => {
    const netSlice = costNetSliceForRow(inv, projectId);
    return {
      ...inv,
      row: {
        netSlice,
        netPaid: costNetPaidForProject(inv as never, projectId),
        netRemaining: costNetRemainingForProject(inv as never, projectId),
      },
    };
  });

  const plannedEvents = plannedEventsAll.slice(0, LIST_TAKE).map((ev) => ({
    ...ev,
    row: plannedEventAmountsForRow(ev, projectId),
  }));

  return {
    project,
    counts: { income: incomeCount, cost: costCount, planned: plannedCount },
    balance,
    incomeInvoices,
    costInvoices,
    plannedEvents,
  };
}

function incomeNetSliceForRow(
  inv: {
    projectId: string | null;
    netAmount: unknown;
    projectAllocations: { projectId: string; netAmount: unknown }[];
  },
  projectId: string,
): number {
  const slices = inv.projectAllocations.filter((a) => a.projectId === projectId);
  if (slices.length > 0) {
    return round2n(slices.reduce((s, a) => s + decToNumber(a.netAmount as never), 0));
  }
  if (inv.projectId === projectId) return decToNumber(inv.netAmount as never);
  return 0;
}

function costNetSliceForRow(
  inv: {
    projectId: string | null;
    netAmount: unknown;
    projectAllocations: { projectId: string; netAmount: unknown }[];
  },
  projectId: string,
): number {
  const slices = inv.projectAllocations.filter((a) => a.projectId === projectId);
  if (slices.length > 0) {
    return round2n(slices.reduce((s, a) => s + decToNumber(a.netAmount as never), 0));
  }
  if (inv.projectId === projectId) return decToNumber(inv.netAmount as never);
  return 0;
}

function plannedEventAmountsForRow(
  ev: {
    projectId: string | null;
    amount: unknown;
    amountVat: unknown;
    projectAllocations: { projectId: string; amount: unknown; amountVat: unknown }[];
  },
  projectId: string,
): PlannedEventRowExtra {
  let net = 0;
  let vat = 0;
  if (ev.projectAllocations.length > 0) {
    for (const a of ev.projectAllocations) {
      if (a.projectId === projectId) {
        net += decToNumber(a.amount as never);
        vat += decToNumber((a.amountVat ?? 0) as never);
      }
    }
  } else if (ev.projectId === projectId) {
    net = decToNumber(ev.amount as never);
    vat = decToNumber((ev.amountVat ?? 0) as never);
  }
  net = round2n(net);
  vat = round2n(vat);
  return {
    netAmount: net,
    vatAmount: vat,
    grossAmount: round2n(net + vat),
  };
}

function round2n(n: number): number {
  return Math.round(n * 100) / 100;
}
