import type { PrismaClient } from "@prisma/client";

const LINKED_STATUSES = new Set([
  "MATCHED",
  "LINKED_COST",
  "LINKED_INCOME",
  "LINKED_OTHER_INCOME",
  "CREATED",
]);

/**
 * Import można usunąć tylko bez powiązań z fakturami / płatnościami / innymi dokumentami.
 * Nie usuwa nic — tylko sprawdza.
 */
export async function bankImportDeleteGuard(
  db: PrismaClient,
  importId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const txs = await db.bankTransaction.findMany({
    where: { importId },
    select: {
      id: true,
      status: true,
      matchedInvoiceId: true,
      linkedCostInvoiceId: true,
      createdCostId: true,
    },
  });

  for (const t of txs) {
    if (t.matchedInvoiceId || t.linkedCostInvoiceId || t.createdCostId) {
      return {
        ok: false,
        message:
          "Nie można usunąć importu, bo część transakcji ma powiązania. Najpierw cofnij powiązania.",
      };
    }
    if (LINKED_STATUSES.has(t.status)) {
      return {
        ok: false,
        message:
          "Nie można usunąć importu, bo część transakcji ma powiązania. Najpierw cofnij powiązania.",
      };
    }
  }

  if (txs.length === 0) {
    return { ok: true };
  }

  const ids = txs.map((t) => t.id);
  const [incPay, costPay, otherInc] = await Promise.all([
    db.incomeInvoicePayment.count({ where: { bankTransactionId: { in: ids } } }),
    db.costInvoicePayment.count({ where: { bankTransactionId: { in: ids } } }),
    db.otherIncome.count({ where: { bankTransactionId: { in: ids } } }),
  ]);

  if (incPay + costPay + otherInc > 0) {
    return {
      ok: false,
      message:
        "Nie można usunąć importu, bo część transakcji ma powiązania. Najpierw cofnij powiązania.",
    };
  }

  return { ok: true };
}
