import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { enrichKsefDocumentListRows } from "@/lib/ksef/enrich-document-list";

export const runtime = "nodejs";

const DIRECTIONS = new Set(["PURCHASE", "SALE", "UNKNOWN"]);
const WORKFLOWS = new Set(["NEW", "PROBABLE_DUPLICATE", "IMPORTED", "REJECTED"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const direction = searchParams.get("direction");
  const workflow = searchParams.get("workflow");

  const where: Prisma.KsefDocumentWhereInput = {};
  if (direction && DIRECTIONS.has(direction)) {
    where.documentDirection = direction;
  }
  if (workflow && WORKFLOWS.has(workflow)) {
    where.workflowStatus = workflow;
  }

  const rows = await prisma.ksefDocument.findMany({
    where,
    orderBy: { issueDate: "desc" },
  });

  return jsonData(await enrichKsefDocumentListRows(rows));
}
