import type { Decimal } from "@prisma/client/runtime/library";
import { decToNumber } from "./money";

export const COST_PAYMENT_AMOUNT_EPS = 0.02;

type MoneyLike = Decimal | string | number | { toString(): string };

export type CostInvoicePaymentAmountPick = {
  grossAmount: MoneyLike;
  amountToPayGross?: MoneyLike | null;
};

function moneyToNumber(value: MoneyLike): number {
  return decToNumber(value as Parameters<typeof decToNumber>[0]);
}

/** Kwota operacyjna do płatności / cashflow / statusu — domyślnie brutto faktury. */
export function costEffectivePaymentGross(inv: CostInvoicePaymentAmountPick): number {
  if (inv.amountToPayGross != null) return moneyToNumber(inv.amountToPayGross);
  return moneyToNumber(inv.grossAmount);
}

export function costHasPaymentAmountSplit(inv: CostInvoicePaymentAmountPick): boolean {
  if (inv.amountToPayGross == null) return false;
  return Math.abs(moneyToNumber(inv.amountToPayGross) - moneyToNumber(inv.grossAmount)) > COST_PAYMENT_AMOUNT_EPS;
}

export function costAdditionalChargesGross(inv: CostInvoicePaymentAmountPick): number | null {
  if (!costHasPaymentAmountSplit(inv)) return null;
  return Math.max(0, costEffectivePaymentGross(inv) - moneyToNumber(inv.grossAmount));
}
