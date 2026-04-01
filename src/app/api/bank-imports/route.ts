import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";

export async function GET() {
  const rows = await prisma.bankImport.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { transactions: true } } },
  });
  return jsonData(rows);
}
