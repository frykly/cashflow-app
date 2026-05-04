import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { healBankTransactionLinks } from "@/lib/bank-import/heal-links";
import { bankImportDeleteGuard } from "@/lib/bank-import/can-delete-bank-import";
import { allocationSummaryByBankTransactionId } from "@/lib/bank-import/bank-transaction-allocation";

function parseSkippedLinesJson(raw: string | null): unknown {
  if (raw == null || !String(raw).trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await healBankTransactionLinks(prisma, id);

  const row = await prisma.bankImport.findUnique({
    where: { id },
    include: {
      transactions: { orderBy: { bookingDate: "desc" } },
      _count: { select: { transactions: true } },
    },
  });
  if (!row) return jsonError("Nie znaleziono importu", 404);
  const ids = row.transactions.map((t) => t.id);
  const amounts = new Map(row.transactions.map((t) => [t.id, t.amount]));
  const allocations = await allocationSummaryByBankTransactionId(prisma, ids, amounts);
  return jsonData({
    ...row,
    transactions: row.transactions.map((t) => ({
      ...t,
      allocation: allocations.get(t.id) ?? {
        allocatedPln: "0.00",
        remainingPln: (Math.abs(t.amount) / 100).toFixed(2),
        fullyAssigned: false,
        partiallyAssigned: false,
      },
    })),
    skippedLinesJson: parseSkippedLinesJson(row.skippedLinesJson),
  });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const exists = await prisma.bankImport.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return jsonError("Nie znaleziono importu", 404);

  const guard = await bankImportDeleteGuard(prisma, id);
  if (!guard.ok) {
    return jsonError(guard.message, 409);
  }

  await prisma.bankImport.delete({ where: { id } });
  return jsonData({ ok: true });
}
