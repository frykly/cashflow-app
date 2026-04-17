import type {
  CostInvoice,
  CostInvoicePayment,
  IncomeInvoice,
  IncomeInvoicePayment,
  PlannedFinancialEvent,
} from "@prisma/client";
import { decToNumber, round2 } from "@/lib/cashflow/money";
import {
  incomePaymentMainVatParts,
  incomeRemainingGross,
  sumCostPaymentsGross,
  sumIncomePaymentsGross,
} from "@/lib/cashflow/settlement";
import { documentGrossSlicesFromInvoice, distributePaymentGrossForReporting } from "@/lib/payment-project-allocation/distribute-read";

type PayAlloc = { projectId: string; grossAmount: unknown };

function projectNetSliceIncome(
  inv: Pick<IncomeInvoice, "netAmount" | "projectId"> & {
    projectAllocations?: { projectId: string; netAmount: unknown }[];
  },
  projectId: string,
): number {
  const slices = (inv.projectAllocations ?? []).filter((a) => a.projectId === projectId);
  if (slices.length > 0) {
    return round2(slices.reduce((s, a) => s + decToNumber(a.netAmount as never), 0));
  }
  if (inv.projectId === projectId) return decToNumber(inv.netAmount as never);
  return 0;
}

function projectNetSliceCost(
  inv: Pick<CostInvoice, "netAmount" | "projectId"> & {
    projectAllocations?: { projectId: string; netAmount: unknown }[];
  },
  projectId: string,
): number {
  const slices = (inv.projectAllocations ?? []).filter((a) => a.projectId === projectId);
  if (slices.length > 0) {
    return round2(slices.reduce((s, a) => s + decToNumber(a.netAmount as never), 0));
  }
  if (inv.projectId === projectId) return decToNumber(inv.netAmount as never);
  return 0;
}

/** MAIN z wpłat przypisany do projektu (split MAIN/VAT + podział wpłaty na projekty). */
export function incomeMainReceivedForProject(
  inv: IncomeInvoice & {
    payments: (IncomeInvoicePayment & { projectAllocations: PayAlloc[] })[];
    projectAllocations: { projectId: string; netAmount: unknown; grossAmount: unknown }[];
  },
  projectId: string,
): number {
  const docSlices = documentGrossSlicesFromInvoice(inv);
  let total = 0;
  for (const p of inv.payments) {
    const parts = incomePaymentMainVatParts(inv, p);
    const pg = decToNumber(p.amountGross);
    if (pg <= 0) continue;
    const byProject = distributePaymentGrossForReporting(pg, p.projectAllocations, docSlices);
    const share = byProject.get(projectId) ?? 0;
    total += parts.main * (share / pg);
  }
  return round2(total);
}

/** Pozostałe netto do wpłaty z faktury (proporcjonalnie do udziału projektu). */
export function incomeNetRemainingForProject(
  inv: IncomeInvoice & { payments: Pick<IncomeInvoicePayment, "amountGross">[] },
  projectId: string,
): number {
  const slice = projectNetSliceIncome(inv, projectId);
  const g = decToNumber(inv.grossAmount);
  if (g <= 0 || slice <= 0) return 0;
  const remG = incomeRemainingGross(inv, inv.payments);
  return round2(slice * (remG / g));
}

/** Zapłacone netto (koszt) przypisane do projektu — proporcjonalnie do brutto wpłat. */
export function costNetPaidForProject(
  inv: CostInvoice & {
    payments: Pick<CostInvoicePayment, "amountGross">[];
    projectAllocations: { projectId: string; netAmount: unknown }[];
  },
  projectId: string,
): number {
  const slice = projectNetSliceCost(inv, projectId);
  const g = decToNumber(inv.grossAmount);
  if (g <= 0 || slice <= 0) return 0;
  const paid = sumCostPaymentsGross(inv.payments);
  return round2(slice * (paid / g));
}

export function costNetRemainingForProject(
  inv: CostInvoice & {
    payments: Pick<CostInvoicePayment, "amountGross">[];
    projectAllocations: { projectId: string; netAmount: unknown }[];
  },
  projectId: string,
): number {
  const slice = projectNetSliceCost(inv, projectId);
  const g = decToNumber(inv.grossAmount);
  if (g <= 0 || slice <= 0) return 0;
  const paid = sumCostPaymentsGross(inv.payments);
  const remG = round2(g - paid);
  return round2(slice * (remG / g));
}

/** Planowane przychody bez faktury: PLANNED, INCOME, bez konwersji, tylko kwota netto (amount). */
export function sumPlannedIncomeNetWithoutInvoice(
  events: (PlannedFinancialEvent & {
    projectAllocations: { projectId: string; amount: unknown; amountVat: unknown }[];
  })[],
  projectId: string,
): number {
  let s = 0;
  for (const ev of events) {
    if (ev.status !== "PLANNED" || ev.type !== "INCOME") continue;
    if (ev.convertedToIncomeInvoiceId) continue;
    if (ev.projectAllocations.length > 0) {
      for (const a of ev.projectAllocations) {
        if (a.projectId === projectId) s += decToNumber(a.amount as never);
      }
    } else if (ev.projectId === projectId) {
      s += decToNumber(ev.amount as never);
    }
  }
  return round2(s);
}

/** Planowane koszty bez faktury: PLANNED, EXPENSE, bez konwersji, netto. */
export function sumPlannedExpenseNetWithoutInvoice(
  events: (PlannedFinancialEvent & {
    projectAllocations: { projectId: string; amount: unknown; amountVat: unknown }[];
  })[],
  projectId: string,
): number {
  let s = 0;
  for (const ev of events) {
    if (ev.status !== "PLANNED" || ev.type !== "EXPENSE") continue;
    if (ev.convertedToCostInvoiceId) continue;
    if (ev.projectAllocations.length > 0) {
      for (const a of ev.projectAllocations) {
        if (a.projectId === projectId) s += decToNumber(a.amount as never);
      }
    } else if (ev.projectId === projectId) {
      s += decToNumber(ev.amount as never);
    }
  }
  return round2(s);
}

export type ProjectBalanceKpis = {
  receivedMain: number;
  incomeRemainingFromInvoices: number;
  plannedIncomeWithoutInvoice: number;
  costNetPaid: number;
  costRemainingFromInvoices: number;
  plannedCostWithoutInvoice: number;
  resultReal: number;
  resultExpected: number;
  resultFinal: number;
  planBaseResult: number;
  deviationFromPlan: number;
};

export function computeProjectBalanceKpis(
  projectId: string,
  plannedRevenueNet: unknown,
  plannedCostNet: unknown,
  incomeInvoices: Parameters<typeof incomeMainReceivedForProject>[0][],
  costInvoices: Parameters<typeof costNetPaidForProject>[0][],
  allPlannedEvents: Parameters<typeof sumPlannedIncomeNetWithoutInvoice>[0],
): ProjectBalanceKpis {
  let receivedMain = 0;
  let incomeRem = 0;
  for (const inv of incomeInvoices) {
    receivedMain = round2(receivedMain + incomeMainReceivedForProject(inv, projectId));
    incomeRem = round2(incomeRem + incomeNetRemainingForProject(inv, projectId));
  }

  let costPaid = 0;
  let costRem = 0;
  for (const inv of costInvoices) {
    costPaid = round2(costPaid + costNetPaidForProject(inv, projectId));
    costRem = round2(costRem + costNetRemainingForProject(inv, projectId));
  }

  const plannedIncomeWithoutInvoice = sumPlannedIncomeNetWithoutInvoice(allPlannedEvents, projectId);
  const plannedCostWithoutInvoice = sumPlannedExpenseNetWithoutInvoice(allPlannedEvents, projectId);

  const resultReal = round2(receivedMain - costPaid);
  const resultExpected = round2(
    incomeRem + plannedIncomeWithoutInvoice - (costRem + plannedCostWithoutInvoice),
  );
  const resultFinal = round2(resultReal + resultExpected);

  const pr = plannedRevenueNet != null && plannedRevenueNet !== undefined ? decToNumber(plannedRevenueNet as never) : 0;
  const pc = plannedCostNet != null && plannedCostNet !== undefined ? decToNumber(plannedCostNet as never) : 0;
  const planBaseResult = round2(pr - pc);
  const deviationFromPlan = round2(resultFinal - planBaseResult);

  return {
    receivedMain: receivedMain,
    incomeRemainingFromInvoices: incomeRem,
    plannedIncomeWithoutInvoice,
    costNetPaid: costPaid,
    costRemainingFromInvoices: costRem,
    plannedCostWithoutInvoice,
    resultReal,
    resultExpected,
    resultFinal,
    planBaseResult,
    deviationFromPlan,
  };
}
