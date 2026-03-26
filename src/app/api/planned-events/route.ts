import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { plannedEventCreateSchema } from "@/lib/validation/schemas";
import { buildPlannedWhere } from "@/lib/prisma-list-filters";
import { resolveProjectFields } from "@/lib/project-persist";
import { ZodError } from "zod";

const sortable = new Set(["plannedDate", "createdAt"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = sortable.has(searchParams.get("sort") ?? "")
    ? (searchParams.get("sort") as "plannedDate" | "createdAt")
    : "plannedDate";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  const where = buildPlannedWhere(searchParams);

  const rows = await prisma.plannedFinancialEvent.findMany({
    where,
    orderBy: { [sort]: order },
    include: { incomeCategory: true, expenseCategory: true, project: true },
  });
  return jsonData(rows);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = plannedEventCreateSchema.parse(body);
    let pf: { projectId: string | null; projectName: string | null };
    try {
      pf = await resolveProjectFields(prisma, data.projectId ?? null);
    } catch {
      return jsonError("Nieprawidłowy projekt", 400);
    }
    const row = await prisma.plannedFinancialEvent.create({
      data: {
        type: data.type,
        title: data.title,
        description: data.description ?? "",
        amount: data.amount,
        amountVat: data.amountVat ?? "0",
        plannedDate: new Date(data.plannedDate),
        status: data.status,
        notes: data.notes ?? "",
        projectId: pf.projectId,
        projectName: pf.projectName,
        incomeCategoryId: data.type === "INCOME" ? (data.incomeCategoryId ?? null) : null,
        expenseCategoryId: data.type === "EXPENSE" ? (data.expenseCategoryId ?? null) : null,
      },
      include: { incomeCategory: true, expenseCategory: true, project: true },
    });
    return jsonData(row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
