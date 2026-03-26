import type { RecurringTemplate } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const zero = new Decimal(0);

export function plannedAmountsFromRecurringTemplate(tmpl: RecurringTemplate): { amount: Decimal; amountVat: Decimal } {
  const mode = tmpl.accountMode ?? "MAIN";
  if (mode === "VAT") {
    return { amount: zero, amountVat: tmpl.amount };
  }
  if (mode === "SPLIT") {
    const v = tmpl.amountVat ?? zero;
    return { amount: tmpl.amount, amountVat: v };
  }
  return { amount: tmpl.amount, amountVat: zero };
}
