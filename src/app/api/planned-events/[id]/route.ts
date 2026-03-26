import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { plannedEventUpdateSchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.plannedFinancialEvent.findUnique({
    where: { id },
    include: { incomeCategory: true, expenseCategory: true },
  });
  if (!row) return jsonError("Nie znaleziono", 404);
  return jsonData(row);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = plannedEventUpdateSchema.parse(body);
    const existing = await prisma.plannedFinancialEvent.findUnique({ where: { id } });
    if (!existing) return jsonError("Nie znaleziono", 404);

    const nextType = data.type ?? existing.type;
    const incomeCategoryId =
      nextType === "INCOME"
        ? data.incomeCategoryId !== undefined
          ? data.incomeCategoryId
          : existing.incomeCategoryId
        : null;
    const expenseCategoryId =
      nextType === "EXPENSE"
        ? data.expenseCategoryId !== undefined
          ? data.expenseCategoryId
          : existing.expenseCategoryId
        : null;

    const row = await prisma.plannedFinancialEvent.update({
      where: { id },
      data: {
        type: nextType,
        title: data.title ?? existing.title,
        description: data.description ?? existing.description,
        amount: data.amount ?? existing.amount,
        amountVat: data.amountVat !== undefined ? data.amountVat : existing.amountVat,
        plannedDate: data.plannedDate ? new Date(data.plannedDate) : existing.plannedDate,
        status: data.status ?? existing.status,
        notes: data.notes ?? existing.notes,
        incomeCategoryId,
        expenseCategoryId,
      },
      include: { incomeCategory: true, expenseCategory: true },
    });
    return jsonData(row);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.plannedFinancialEvent.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return jsonError("Nie znaleziono", 404);
  }
}
