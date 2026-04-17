import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";

export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.ksefDocument.findMany({
    orderBy: { issueDate: "desc" },
  });
  return jsonData(rows);
}
