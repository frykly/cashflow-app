import type { PrismaClient } from "@prisma/client";
import { round2 } from "@/lib/cashflow/money";
import { sumCostPaymentsGross, sumIncomePaymentsGross } from "@/lib/cashflow/settlement";

export type BankTransactionAllocationSummary = {
  allocatedPln: string;
  remainingPln: string;
  fullyAssigned: boolean;
  partiallyAssigned: boolean;
};

export async function allocationSummaryByBankTransactionId(
  db: PrismaClient,
  transactionIds: string[],
  amountsById: Map<string, number>,
): Promise<Map<string, BankTransactionAllocationSummary>> {
  const out = new Map<string, BankTransactionAllocationSummary>();
  if (transactionIds.length === 0) return out;

  const [costPayments, incomePayments, otherIncomes] = await Promise.all([
    db.costInvoicePayment.findMany({
      where: { bankTransactionId: { in: transactionIds } },
      select: { bankTransactionId: true, amountGross: true },
    }),
    db.incomeInvoicePayment.findMany({
      where: { bankTransactionId: { in: transactionIds } },
      select: { bankTransactionId: true, amountGross: true },
    }),
    db.otherIncome.findMany({
      where: { bankTransactionId: { in: transactionIds } },
      select: { bankTransactionId: true, amountGross: true },
    }),
  ]);

  for (const id of transactionIds) {
    const amountAbs = Math.abs(amountsById.get(id) ?? 0) / 100;
    const allocated = round2(
      sumCostPaymentsGross(costPayments.filter((p) => p.bankTransactionId === id)) +
        sumIncomePaymentsGross(incomePayments.filter((p) => p.bankTransactionId === id)) +
        sumIncomePaymentsGross(otherIncomes.filter((p) => p.bankTransactionId === id)),
    );
    const remaining = round2(amountAbs - allocated);
    out.set(id, {
      allocatedPln: allocated.toFixed(2),
      remainingPln: remaining.toFixed(2),
      fullyAssigned: amountAbs > 0 && remaining <= 0.005,
      partiallyAssigned: allocated > 0.005 && remaining > 0.005,
    });
  }

  return out;
}
