import type { PrismaClient } from "@prisma/client";

/**
 * Usuwa „martwe” powiązania (np. koszt usunięty z systemu) i ustawia BROKEN_LINK.
 * Wywołaj przy odczycie szczegółów importu lub przed akcją na wierszu.
 */
export async function healBankTransactionLinks(db: PrismaClient, importId?: string): Promise<void> {
  const whereImport = importId ? { importId } : {};

  const withCost = await db.bankTransaction.findMany({
    where: {
      ...whereImport,
      createdCostId: { not: null },
      status: { in: ["CREATED", "LINKED_COST"] },
    },
    select: { id: true, createdCostId: true },
  });

  for (const row of withCost) {
    if (!row.createdCostId) continue;
    const cost = await db.costInvoice.findUnique({ where: { id: row.createdCostId }, select: { id: true } });
    if (!cost) {
      await db.bankTransaction.update({
        where: { id: row.id },
        data: { status: "BROKEN_LINK", createdCostId: null },
      });
    }
  }

  const withLinkedCost = await db.bankTransaction.findMany({
    where: {
      ...whereImport,
      linkedCostInvoiceId: { not: null },
    },
    select: { id: true, linkedCostInvoiceId: true },
  });

  for (const row of withLinkedCost) {
    if (!row.linkedCostInvoiceId) continue;
    const inv = await db.costInvoice.findUnique({ where: { id: row.linkedCostInvoiceId }, select: { id: true } });
    if (!inv) {
      await db.bankTransaction.update({
        where: { id: row.id },
        data: { status: "BROKEN_LINK", linkedCostInvoiceId: null },
      });
    }
  }

  const withIncome = await db.bankTransaction.findMany({
    where: {
      ...whereImport,
      matchedInvoiceId: { not: null },
    },
    select: { id: true, matchedInvoiceId: true },
  });

  for (const row of withIncome) {
    if (!row.matchedInvoiceId) continue;
    const inv = await db.incomeInvoice.findUnique({ where: { id: row.matchedInvoiceId }, select: { id: true } });
    if (!inv) {
      await db.bankTransaction.update({
        where: { id: row.id },
        data: { status: "BROKEN_LINK", matchedInvoiceId: null },
      });
    }
  }

  const withOtherIncome = await db.bankTransaction.findMany({
    where: {
      ...whereImport,
      status: "LINKED_OTHER_INCOME",
    },
    select: { id: true },
  });

  for (const row of withOtherIncome) {
    const oi = await db.otherIncome.findUnique({ where: { bankTransactionId: row.id }, select: { id: true } });
    if (!oi) {
      await db.bankTransaction.update({
        where: { id: row.id },
        data: { status: "BROKEN_LINK" },
      });
    }
  }
}
