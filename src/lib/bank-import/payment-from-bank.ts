import { Decimal } from "@prisma/client/runtime/library";
import { decToNumber } from "@/lib/cashflow/money";
import { PAY_EPS, sumCostPaymentsGross, sumIncomePaymentsGross } from "@/lib/cashflow/settlement";
import type { CostInvoice, CostInvoicePayment, IncomeInvoice, IncomeInvoicePayment } from "@prisma/client";

export const BANK_LINK_PAYMENT_NOTE = "Import bankowy — dopasowanie do faktury";
export const BANK_COST_PAYMENT_NOTE = "Import bankowy — płatność z wyciągu";

export function bankGroszeToAmountGross(grosze: number): Decimal {
  return new Decimal((Math.abs(grosze) / 100).toFixed(2));
}

export function assertIncomeLinkSign(bankAmountGrosze: number): void {
  if (bankAmountGrosze <= 0) throw new Error("INCOME_REQUIRES_POSITIVE_AMOUNT");
}

export function assertCostLinkSign(bankAmountGrosze: number): void {
  if (bankAmountGrosze >= 0) throw new Error("COST_REQUIRES_NEGATIVE_AMOUNT");
}

export function assertIncomePaymentFits(
  inv: Pick<IncomeInvoice, "grossAmount"> & { payments: Pick<IncomeInvoicePayment, "amountGross">[] },
  nextGross: Decimal,
): void {
  const cur = sumIncomePaymentsGross(inv.payments);
  const next = decToNumber(nextGross);
  if (cur + next > decToNumber(inv.grossAmount) + PAY_EPS) throw new Error("INCOME_PAYMENT_EXCEEDS_GROSS");
}

export function assertCostPaymentFits(
  inv: Pick<CostInvoice, "grossAmount"> & { payments: Pick<CostInvoicePayment, "amountGross">[] },
  nextGross: Decimal,
): void {
  const cur = sumCostPaymentsGross(inv.payments);
  const next = decToNumber(nextGross);
  if (cur + next > decToNumber(inv.grossAmount) + PAY_EPS) throw new Error("COST_PAYMENT_EXCEEDS_GROSS");
}
