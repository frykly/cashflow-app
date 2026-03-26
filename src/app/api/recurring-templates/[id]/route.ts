import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { recurringTemplateUpdateSchema } from "@/lib/validation/schemas";
import { recurringSplitAmountError } from "@/lib/validation/recurring-split";
import { syncRecurringTemplateAmounts, syncRecurringTemplateSchedule } from "@/lib/cashflow/recurring-sync";
import type { RecurringTemplate } from "@prisma/client";
import { NextResponse } from "next/server";
import { startOfDay } from "date-fns";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

function scheduleFingerprint(r: RecurringTemplate): string {
  return [
    r.frequency,
    startOfDay(r.startDate).getTime(),
    r.endDate ? startOfDay(r.endDate).getTime() : "null",
    r.dayOfMonth ?? "n",
    r.weekday ?? "n",
    r.type,
  ].join("|");
}

function metaFingerprint(r: RecurringTemplate): string {
  return [
    String(r.amount),
    String(r.amountVat ?? ""),
    r.accountMode ?? "MAIN",
    r.title,
    r.notes,
    r.incomeCategoryId ?? "",
    r.expenseCategoryId ?? "",
  ].join("|");
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.recurringTemplate.findUnique({
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
    const data = recurringTemplateUpdateSchema.parse(body);
    const existing = await prisma.recurringTemplate.findUnique({ where: { id } });
    if (!existing) return jsonError("Nie znaleziono", 404);

    const nextType = data.type ?? existing.type;
    const nextMode = data.accountMode ?? existing.accountMode;
    const nextAmountVatRaw =
      data.amountVat !== undefined
        ? data.amountVat
        : existing.amountVat != null
          ? String(existing.amountVat)
          : null;
    const splitErr = recurringSplitAmountError(nextMode, nextAmountVatRaw);
    if (splitErr) return jsonError(splitErr, 400);

    const row = await prisma.recurringTemplate.update({
      where: { id },
      data: {
        title: data.title ?? existing.title,
        type: nextType,
        accountMode: data.accountMode ?? existing.accountMode,
        amount: data.amount ?? existing.amount,
        amountVat: nextMode === "SPLIT" ? (data.amountVat !== undefined ? data.amountVat : existing.amountVat) : null,
        incomeCategoryId:
          nextType === "INCOME"
            ? data.incomeCategoryId !== undefined
              ? data.incomeCategoryId
              : existing.incomeCategoryId
            : null,
        expenseCategoryId:
          nextType === "EXPENSE"
            ? data.expenseCategoryId !== undefined
              ? data.expenseCategoryId
              : existing.expenseCategoryId
            : null,
        frequency: data.frequency ?? existing.frequency,
        startDate: data.startDate ? new Date(data.startDate) : existing.startDate,
        endDate: data.endDate === undefined ? existing.endDate : data.endDate ? new Date(data.endDate) : null,
        dayOfMonth: data.dayOfMonth !== undefined ? data.dayOfMonth : existing.dayOfMonth,
        weekday: data.weekday !== undefined ? data.weekday : existing.weekday,
        notes: data.notes ?? existing.notes,
        isActive: data.isActive ?? existing.isActive,
      },
      include: { incomeCategory: true, expenseCategory: true },
    });

    if (row.isActive) {
      if (scheduleFingerprint(existing) !== scheduleFingerprint(row)) {
        await syncRecurringTemplateSchedule(id);
      } else if (metaFingerprint(existing) !== metaFingerprint(row)) {
        await syncRecurringTemplateAmounts(id);
      }
    }

    return jsonData(row);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.recurringTemplate.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return jsonError("Nie znaleziono", 404);
  }
}
