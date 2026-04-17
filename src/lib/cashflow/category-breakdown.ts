import type {
  CostInvoice,
  CostInvoicePayment,
  IncomeInvoice,
  IncomeInvoicePayment,
  IncomeInvoicePlannedPayment,
  PlannedFinancialEvent,
} from "@prisma/client";
import { addDays, isBefore, startOfDay } from "date-fns";
import { activeIncomePlanRows, remainderSplitByIncomePlan } from "./forecast";
import { decToNumber } from "./money";
import {
  costPaymentDeltas,
  costRemainingGross,
  incomeRemainingMainVat,
  isCostFullyPaid,
  isIncomeFullyPaid,
  PAY_EPS,
} from "./settlement";

export type CategoryRow = { categoryId: string | null; name: string; mainAmount: number };

export function breakdownIncomeByCategory30(
  incomes: (IncomeInvoice & { payments: IncomeInvoicePayment[]; plannedPayments?: IncomeInvoicePlannedPayment[] })[],
  events: PlannedFinancialEvent[],
  incomeCategoryName: (id: string | null) => string,
  now = new Date(),
): CategoryRow[] {
  const start = startOfDay(now);
  const end = addDays(start, 30);
  const map = new Map<string | null, number>();

  for (const inv of incomes) {
    if (isIncomeFullyPaid(inv, inv.payments)) continue;
    const { remMain } = incomeRemainingMainVat(inv, inv.payments);
    if (remMain <= PAY_EPS) continue;
    const cid = inv.incomeCategoryId ?? null;
    const rows = activeIncomePlanRows(inv);
    if (rows.length > 0) {
      const splits = remainderSplitByIncomePlan(inv, inv.payments, rows);
      for (const s of splits) {
        if (s.main <= PAY_EPS) continue;
        if (isBefore(s.dueDate, start) || !isBefore(s.dueDate, end)) continue;
        map.set(cid, (map.get(cid) ?? 0) + s.main);
      }
    } else {
      const d = inv.plannedIncomeDate;
      if (isBefore(d, start) || !isBefore(d, end)) continue;
      map.set(cid, (map.get(cid) ?? 0) + remMain);
    }
  }

  for (const ev of events) {
    if (ev.status !== "PLANNED" || ev.type !== "INCOME") continue;
    const d = ev.plannedDate;
    if (isBefore(d, start) || !isBefore(d, end)) continue;
    const cid = ev.incomeCategoryId ?? null;
    map.set(cid, (map.get(cid) ?? 0) + decToNumber(ev.amount) + decToNumber(ev.amountVat ?? 0));
  }

  return sortBreakdown(map, incomeCategoryName);
}

export function breakdownExpenseByCategory30(
  costs: (CostInvoice & { payments: CostInvoicePayment[] })[],
  events: PlannedFinancialEvent[],
  expenseCategoryName: (id: string | null) => string,
  now = new Date(),
): CategoryRow[] {
  const start = startOfDay(now);
  const end = addDays(start, 30);
  const map = new Map<string | null, number>();

  for (const inv of costs) {
    if (isCostFullyPaid(inv, inv.payments)) continue;
    const d = inv.plannedPaymentDate;
    if (isBefore(d, start) || !isBefore(d, end)) continue;
    const rem = costRemainingGross(inv, inv.payments);
    const { main } = costPaymentDeltas(inv, rem);
    if (main >= 0) continue;
    const cid = inv.expenseCategoryId ?? null;
    map.set(cid, (map.get(cid) ?? 0) + Math.abs(main));
  }

  for (const ev of events) {
    if (ev.status !== "PLANNED" || ev.type !== "EXPENSE") continue;
    const d = ev.plannedDate;
    if (isBefore(d, start) || !isBefore(d, end)) continue;
    const cid = ev.expenseCategoryId ?? null;
    const amt = decToNumber(ev.amount) + decToNumber(ev.amountVat ?? 0);
    map.set(cid, (map.get(cid) ?? 0) + amt);
  }

  return sortBreakdown(map, expenseCategoryName);
}

function sortBreakdown(
  map: Map<string | null, number>,
  nameFn: (id: string | null) => string,
): CategoryRow[] {
  const rows: CategoryRow[] = [];
  for (const [categoryId, mainAmount] of map.entries()) {
    rows.push({ categoryId, name: nameFn(categoryId), mainAmount });
  }
  rows.sort((a, b) => b.mainAmount - a.mainAmount);
  return rows;
}
