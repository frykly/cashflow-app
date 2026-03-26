import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";

export async function GET() {
  const rows = await prisma.incomeCategory.findMany({ orderBy: { name: "asc" } });
  return jsonData(rows);
}
