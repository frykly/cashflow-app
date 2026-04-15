import type { Prisma, PrismaClient } from "@prisma/client";

export type PaymentProjectAllocInput = {
  projectId: string;
  grossAmount: string;
  description?: string;
};

export async function replaceCostPaymentProjectAllocations(
  tx: Prisma.TransactionClient,
  costInvoicePaymentId: string,
  rows: PaymentProjectAllocInput[],
): Promise<void> {
  await tx.costInvoicePaymentProjectAllocation.deleteMany({ where: { costInvoicePaymentId } });
  if (rows.length === 0) return;
  await tx.costInvoicePaymentProjectAllocation.createMany({
    data: rows.map((r) => ({
      costInvoicePaymentId,
      projectId: r.projectId,
      grossAmount: r.grossAmount,
      description: r.description?.trim() ?? "",
    })),
  });
}

export async function replaceIncomePaymentProjectAllocations(
  tx: Prisma.TransactionClient,
  incomeInvoicePaymentId: string,
  rows: PaymentProjectAllocInput[],
): Promise<void> {
  await tx.incomeInvoicePaymentProjectAllocation.deleteMany({ where: { incomeInvoicePaymentId } });
  if (rows.length === 0) return;
  await tx.incomeInvoicePaymentProjectAllocation.createMany({
    data: rows.map((r) => ({
      incomeInvoicePaymentId,
      projectId: r.projectId,
      grossAmount: r.grossAmount,
      description: r.description?.trim() ?? "",
    })),
  });
}

/** Usuwa alokacje płatności przy usuwaniu / czyszczeniu (np. pojedynczy projekt). */
export async function clearCostPaymentAllocations(db: PrismaClient | Prisma.TransactionClient, paymentId: string) {
  await db.costInvoicePaymentProjectAllocation.deleteMany({ where: { costInvoicePaymentId: paymentId } });
}

export async function clearIncomePaymentAllocations(db: PrismaClient | Prisma.TransactionClient, paymentId: string) {
  await db.incomeInvoicePaymentProjectAllocation.deleteMany({ where: { incomeInvoicePaymentId: paymentId } });
}
