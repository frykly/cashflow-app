import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";

export async function GET() {
  const rows = await prisma.expenseCategory.findMany({ orderBy: { name: "asc" } });
  return jsonData(rows);
}
