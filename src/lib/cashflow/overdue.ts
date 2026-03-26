import type { CostInvoice, CostInvoicePayment, IncomeInvoice, IncomeInvoicePayment, PlannedFinancialEvent } from "@prisma/client";
import { isBefore, startOfDay } from "date-fns";
import { isCostFullyPaid, isIncomeFullyPaid } from "./settlement";

/** „Po terminie” = data (kalendarzowa) wcześniejsza niż dziś. */
export function isCalendarOverdue(d: Date, now = new Date()): boolean {
  return isBefore(startOfDay(d), startOfDay(now));
}

export function isIncomeInvoiceOverdue(
  inv: IncomeInvoice,
  payments: Pick<IncomeInvoicePayment, "amountGross">[],
  now = new Date(),
): boolean {
  if (isIncomeFullyPaid(inv, payments)) return false;
  return isCalendarOverdue(inv.plannedIncomeDate, now) || isCalendarOverdue(inv.paymentDueDate, now);
}

export function isCostInvoiceOverdue(
  inv: CostInvoice,
  payments: Pick<CostInvoicePayment, "amountGross">[],
  now = new Date(),
): boolean {
  if (isCostFullyPaid(inv, payments)) return false;
  return isCalendarOverdue(inv.plannedPaymentDate, now) || isCalendarOverdue(inv.paymentDueDate, now);
}

export function isPlannedEventOverdue(ev: PlannedFinancialEvent, now = new Date()): boolean {
  if (ev.status !== "PLANNED") return false;
  return isCalendarOverdue(ev.plannedDate, now);
}
