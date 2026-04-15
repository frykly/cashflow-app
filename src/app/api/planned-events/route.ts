import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { plannedEventCreateSchema } from "@/lib/validation/schemas";
import { buildPlannedWhere } from "@/lib/prisma-list-filters";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { replacePlannedEventAllocations, resolveLegacyProjectFieldsFromAllocations } from "@/lib/project-allocations/persist";
import { validatePlannedAllocationSums } from "@/lib/project-allocations/validate";
import { ZodError } from "zod";

const sortable = new Set(["plannedDate", "createdAt", "title", "type", "status", "amount"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = sortable.has(searchParams.get("sort") ?? "")
    ? (searchParams.get("sort") as "plannedDate" | "createdAt" | "title" | "type" | "status" | "amount")
    : "plannedDate";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  const where = buildPlannedWhere(searchParams);

  const rows = await prisma.plannedFinancialEvent.findMany({
    where,
    orderBy: { [sort]: order },
    include: {
      incomeCategory: true,
      expenseCategory: true,
      project: true,
      projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
    },
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
    const mainAmt = normalizeDecimalInput(String(data.amount));
    const vatAmt = normalizeDecimalInput(String(data.amountVat ?? "0"));
    const allocs = data.projectAllocations?.map((r) => ({
      ...r,
      amountVat: normalizeDecimalInput(String(r.amountVat ?? "0")),
    }));
    if (allocs?.length) {
      const err = validatePlannedAllocationSums(allocs, mainAmt, vatAmt);
      if (err) return jsonError(err, 400);
    }
    let pf: { projectId: string | null; projectName: string | null };
    try {
      pf = await resolveLegacyProjectFieldsFromAllocations(prisma, data.projectId, allocs);
    } catch {
      return jsonError("Nieprawidłowy projekt", 400);
    }
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.plannedFinancialEvent.create({
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
      await replacePlannedEventAllocations(
        tx,
        created.id,
        (allocs ?? []).map((r) => ({
          projectId: r.projectId,
          amount: normalizeDecimalInput(String(r.amount)),
          amountVat: normalizeDecimalInput(String(r.amountVat ?? "0")),
          description: r.description,
        })),
      );
      return created;
    });
    const fresh = await prisma.plannedFinancialEvent.findUnique({
      where: { id: row.id },
      include: {
        incomeCategory: true,
        expenseCategory: true,
        project: true,
        projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
      },
    });
    return jsonData(fresh ?? row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
