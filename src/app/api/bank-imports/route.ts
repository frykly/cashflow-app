import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { allocationSummaryByBankTransactionId } from "@/lib/bank-import/bank-transaction-allocation";

export async function GET() {
  const rows = await prisma.bankImport.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      transactions: { select: { id: true, amount: true } },
      _count: { select: { transactions: true } },
    },
  });
  const ids = rows.flatMap((r) => r.transactions.map((t) => t.id));
  const amounts = new Map(rows.flatMap((r) => r.transactions.map((t) => [t.id, t.amount] as const)));
  const allocations = await allocationSummaryByBankTransactionId(prisma, ids, amounts);
  return jsonData(
    rows.map((r) => {
      let partial = 0;
      for (const t of r.transactions) {
        if (allocations.get(t.id)?.partiallyAssigned) partial += 1;
      }
      const rest = {
        id: r.id,
        fileName: r.fileName,
        skippedLinesJson: r.skippedLinesJson,
        createdAt: r.createdAt,
        _count: r._count,
      };
      return {
        ...rest,
        allocationSummary: { partiallyAssignedTransactions: partial },
      };
    }),
  );
}
