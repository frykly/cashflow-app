import type { Prisma } from "@prisma/client";

/** Oznacza zdarzenie planowane jako skonwertowane na fakturę przychodową (w transakcji). */
export async function finalizePlannedToIncomeConversion(
  tx: Prisma.TransactionClient,
  plannedEventId: string,
  incomeInvoiceId: string,
) {
  const ev = await tx.plannedFinancialEvent.findUnique({ where: { id: plannedEventId } });
  if (!ev) throw new Error("PLANNED_NOT_FOUND");
  if (ev.type !== "INCOME") throw new Error("PLANNED_TYPE_MISMATCH");
  if (ev.status !== "PLANNED") throw new Error("PLANNED_NOT_ACTIVE");
  if (ev.convertedToIncomeInvoiceId || ev.convertedToCostInvoiceId) throw new Error("PLANNED_ALREADY_CONVERTED");
  await tx.plannedFinancialEvent.update({
    where: { id: plannedEventId },
    data: {
      status: "CONVERTED",
      convertedToIncomeInvoiceId: incomeInvoiceId,
      convertedAt: new Date(),
    },
  });
}

/** Oznacza zdarzenie planowane jako skonwertowane na fakturę kosztową (w transakcji). */
export async function finalizePlannedToCostConversion(
  tx: Prisma.TransactionClient,
  plannedEventId: string,
  costInvoiceId: string,
) {
  const ev = await tx.plannedFinancialEvent.findUnique({ where: { id: plannedEventId } });
  if (!ev) throw new Error("PLANNED_NOT_FOUND");
  if (ev.type !== "EXPENSE") throw new Error("PLANNED_TYPE_MISMATCH");
  if (ev.status !== "PLANNED") throw new Error("PLANNED_NOT_ACTIVE");
  if (ev.convertedToIncomeInvoiceId || ev.convertedToCostInvoiceId) throw new Error("PLANNED_ALREADY_CONVERTED");
  await tx.plannedFinancialEvent.update({
    where: { id: plannedEventId },
    data: {
      status: "CONVERTED",
      convertedToCostInvoiceId: costInvoiceId,
      convertedAt: new Date(),
    },
  });
}
