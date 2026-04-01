import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.bankImport.findUnique({
    where: { id },
    include: {
      transactions: { orderBy: { bookingDate: "desc" } },
      _count: { select: { transactions: true } },
    },
  });
  if (!row) return jsonError("Nie znaleziono importu", 404);
  return jsonData(row);
}
