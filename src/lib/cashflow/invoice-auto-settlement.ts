import type { CostInvoice, CostInvoicePayment, IncomeInvoice, IncomeInvoicePayment } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import {
  PAY_EPS,
  costRemainingGross,
  incomeRemainingGross,
} from "@/lib/cashflow/settlement";
import { finalizeNewCostPaymentAllocations, finalizeNewIncomePaymentAllocations } from "@/lib/payment-project-allocation/finalize";

export const AUTO_INCOME_PAYMENT_NOTE = "Automatycznie dodane przy oznaczeniu jako opłacona";
export const AUTO_COST_PAYMENT_NOTE = "Automatycznie dodane przy oznaczeniu jako zapłacona";

type IncomePayGross = Pick<IncomeInvoicePayment, "amountGross">;
type CostPayGross = Pick<CostInvoicePayment, "amountGross">;

/** Blokuje obniżenie statusu, gdy wpłaty już zamykają brutto. */
export function assertIncomeStatusAllowedForPayments(
  inv: Pick<IncomeInvoice, "grossAmount">,
  payments: IncomePayGross[],
  requestedStatus: string,
): void {
  const rem = incomeRemainingGross(inv, payments);
  if (rem <= PAY_EPS && requestedStatus !== "OPLACONA") {
    throw new Error(
      "Wpłaty pokrywają całe brutto — usuń lub zmniejsz wpłaty, zanim obniżysz status z „opłacona”.",
    );
  }
}

/** Blokuje obniżenie statusu / paid, gdy płatności zamykają brutto. */
export function assertCostStatusAllowedForPayments(
  inv: Pick<CostInvoice, "grossAmount">,
  payments: CostPayGross[],
  requestedStatus: string,
  requestedPaid: boolean,
): void {
  const rem = costRemainingGross(inv, payments);
  if (rem <= PAY_EPS && (requestedStatus !== "ZAPLACONA" || !requestedPaid)) {
    throw new Error(
      "Płatności pokrywają całe brutto — usuń lub zmniejsz płatności albo ustaw status „Zapłacona” i zaznacz zapłacone.",
    );
  }
}

function decimalFromRemaining(rem: number): Decimal {
  const x = Math.max(0, rem);
  return new Decimal(x.toFixed(2));
}

/**
 * Jeśli dokument jest oznaczony jako w pełni rozliczony, a brakuje wpłat do kwoty brutto — dopisuje jedną wpłatę.
 */
export async function ensureClosingIncomePaymentIfFullySettled(invoiceId: string): Promise<boolean> {
  const inv = await prisma.incomeInvoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!inv || inv.status !== "OPLACONA") return false;

  const rem = incomeRemainingGross(inv, inv.payments);
  if (rem <= PAY_EPS) return false;

  const paymentDate = inv.actualIncomeDate ?? inv.plannedIncomeDate;
  const amountGross = decimalFromRemaining(rem);
  const amountStr = amountGross.toString();
  await prisma.$transaction(async (tx) => {
    const pay = await tx.incomeInvoicePayment.create({
      data: {
        incomeInvoiceId: invoiceId,
        amountGross,
        paymentDate,
        notes: AUTO_INCOME_PAYMENT_NOTE,
      },
    });
    await finalizeNewIncomePaymentAllocations(tx, invoiceId, pay.id, amountStr, null);
  });
  return true;
}

/**
 * Jeśli koszt jest oznaczony jako zapłacony w całości, a brakuje płatności — dopisuje jedną płatność.
 */
export async function ensureClosingCostPaymentIfFullySettled(invoiceId: string): Promise<boolean> {
  const inv = await prisma.costInvoice.findUnique({
    where: { id: invoiceId },
    include: { payments: true },
  });
  if (!inv) return false;
  if (inv.status !== "ZAPLACONA" && !inv.paid) return false;

  const rem = costRemainingGross(inv, inv.payments);
  if (rem <= PAY_EPS) return false;

  const paymentDate = inv.actualPaymentDate ?? inv.plannedPaymentDate;
  const amountGross = decimalFromRemaining(rem);
  const amountStr = amountGross.toString();
  await prisma.$transaction(async (tx) => {
    const pay = await tx.costInvoicePayment.create({
      data: {
        costInvoiceId: invoiceId,
        amountGross,
        paymentDate,
        notes: AUTO_COST_PAYMENT_NOTE,
      },
    });
    await finalizeNewCostPaymentAllocations(tx, invoiceId, pay.id, amountStr, null);
  });
  return true;
}
