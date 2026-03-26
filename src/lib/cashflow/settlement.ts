import type {
  CostInvoice,
  CostInvoicePayment,
  IncomeInvoice,
  IncomeInvoicePayment,
} from "@prisma/client";
import { decToNumber, round2 } from "./money";

export const PAY_EPS = 0.005;

export function sumIncomePaymentsGross(payments: Pick<IncomeInvoicePayment, "amountGross">[]): number {
  return round2(payments.reduce((s, p) => s + decToNumber(p.amountGross), 0));
}

export function sumCostPaymentsGross(payments: Pick<CostInvoicePayment, "amountGross">[]): number {
  return round2(payments.reduce((s, p) => s + decToNumber(p.amountGross), 0));
}

export function incomeRemainingGross(inv: IncomeInvoice, payments: Pick<IncomeInvoicePayment, "amountGross">[]): number {
  return round2(decToNumber(inv.grossAmount) - sumIncomePaymentsGross(payments));
}

export function costRemainingGross(inv: CostInvoice, payments: Pick<CostInvoicePayment, "amountGross">[]): number {
  return round2(decToNumber(inv.grossAmount) - sumCostPaymentsGross(payments));
}

export function isIncomeFullyPaid(inv: IncomeInvoice, payments: Pick<IncomeInvoicePayment, "amountGross">[]): boolean {
  if (payments.length === 0 && inv.status === "OPLACONA") return true;
  return incomeRemainingGross(inv, payments) <= PAY_EPS;
}

export function isCostFullyPaid(inv: CostInvoice, payments: Pick<CostInvoicePayment, "amountGross">[]): boolean {
  if (payments.length === 0 && inv.paid) return true;
  return costRemainingGross(inv, payments) <= PAY_EPS;
}

/** Rozbicie kwoty brutto wpłaty na MAIN / VAT wg proporcji dokumentu (dla vatDestination=VAT). */
export function incomePaymentDeltas(inv: IncomeInvoice, amountGross: number): { main: number; vat: number } {
  if (inv.vatDestination === "MAIN") {
    return { main: round2(amountGross), vat: 0 };
  }
  const g = decToNumber(inv.grossAmount);
  if (g <= 0) return { main: 0, vat: 0 };
  const net = decToNumber(inv.netAmount);
  const vat = decToNumber(inv.vatAmount);
  const ratio = amountGross / g;
  return { main: round2(net * ratio), vat: round2(vat * ratio) };
}

/** Skalowanie pełnych delt kosztu do części kwoty brutto. */
export function costPaymentDeltas(inv: CostInvoice, amountGross: number): { main: number; vat: number } {
  const gross = decToNumber(inv.grossAmount);
  if (gross <= 0) return { main: 0, vat: 0 };
  const { main: fm, vat: fv } = costDeltasFull(inv);
  const ratio = amountGross / gross;
  return { main: round2(fm * ratio), vat: round2(fv * ratio) };
}

function costDeltasFull(inv: CostInvoice): { main: number; vat: number } {
  const gross = decToNumber(inv.grossAmount);
  if (inv.paymentSource === "MAIN") {
    return { main: -gross, vat: 0 };
  }
  if (inv.paymentSource === "VAT_THEN_MAIN") {
    return { main: -decToNumber(inv.netAmount), vat: -decToNumber(inv.vatAmount) };
  }
  return { main: 0, vat: -gross };
}

/** Płatność kosztu: najpierw z konta VAT (do kwoty VAT), reszta netto + brak VAT z MAIN. */
export function costPaymentDeltasVatFirst(
  inv: CostInvoice,
  amountGross: number,
  vatBalanceBefore: number,
): { main: number; vat: number } {
  if (inv.paymentSource !== "VAT_THEN_MAIN") {
    return costPaymentDeltas(inv, amountGross);
  }
  const gross = decToNumber(inv.grossAmount);
  if (gross <= 0) return { main: 0, vat: 0 };
  const ratio = amountGross / gross;
  const netPart = round2(decToNumber(inv.netAmount) * ratio);
  const vatPart = round2(decToNumber(inv.vatAmount) * ratio);
  const avail = Math.max(0, vatBalanceBefore);
  const fromVat = Math.min(vatPart, avail);
  const vatShortfall = round2(vatPart - fromVat);
  return { main: round2(-(netPart + vatShortfall)), vat: round2(-fromVat) };
}

export function computeIncomeStatus(inv: IncomeInvoice, payments: Pick<IncomeInvoicePayment, "amountGross">[]): string {
  const paidSum = sumIncomePaymentsGross(payments);
  const rem = incomeRemainingGross(inv, payments);
  if (rem <= PAY_EPS) return "OPLACONA";
  if (paidSum > PAY_EPS) return "PARTIALLY_RECEIVED";
  if (inv.status === "WYSTAWIONA") return "WYSTAWIONA";
  return "PLANOWANA";
}

export function computeCostStatus(
  inv: CostInvoice,
  payments: Pick<CostInvoicePayment, "amountGross">[],
): { status: string; paid: boolean } {
  const paidSum = sumCostPaymentsGross(payments);
  const rem = costRemainingGross(inv, payments);
  if (rem <= PAY_EPS) return { status: "ZAPLACONA", paid: true };
  if (paidSum > PAY_EPS) return { status: "PARTIALLY_PAID", paid: false };
  if (inv.status === "DO_ZAPLATY") return { status: "DO_ZAPLATY", paid: false };
  return { status: "PLANOWANA", paid: false };
}
