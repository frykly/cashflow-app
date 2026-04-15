import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { plannedEventUpdateSchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { resolveProjectFields } from "@/lib/project-persist";
import { replacePlannedEventAllocations, resolveLegacyProjectFieldsFromAllocations } from "@/lib/project-allocations/persist";
import { validatePlannedAllocationSums } from "@/lib/project-allocations/validate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.plannedFinancialEvent.findUnique({
    where: { id },
    include: {
      incomeCategory: true,
      expenseCategory: true,
      project: true,
      convertedToIncomeInvoice: { select: { id: true, invoiceNumber: true } },
      convertedToCostInvoice: { select: { id: true, documentNumber: true } },
      projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
    },
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
    const existing = await prisma.plannedFinancialEvent.findUnique({
      where: { id },
      include: { projectAllocations: { select: { id: true } } },
    });
    if (!existing) return jsonError("Nie znaleziono", 404);
    if (existing.status === "CONVERTED") {
      return jsonError("Zdarzenie skonwertowane na fakturę — edycja jest zablokowana.", 409);
    }

    const mergedMain = normalizeDecimalInput(String(data.amount ?? existing.amount));
    const mergedVat = normalizeDecimalInput(String(data.amountVat !== undefined ? data.amountVat : existing.amountVat));
    const hadAlloc = existing.projectAllocations.length > 0;
    const mainChanged =
      data.amount !== undefined &&
      normalizeDecimalInput(String(data.amount)) !== normalizeDecimalInput(existing.amount.toString());
    const vatPartChanged =
      data.amountVat !== undefined &&
      normalizeDecimalInput(String(data.amountVat)) !== normalizeDecimalInput(existing.amountVat.toString());
    if (hadAlloc && (mainChanged || vatPartChanged) && data.projectAllocations === undefined) {
      return jsonError(
        "To zdarzenie ma alokacje projektów — po zmianie kwot wyślij pole „projectAllocations” z pełnym podziałem lub usuń alokacje (pusta tablica).",
        400,
      );
    }

    const allocs = data.projectAllocations?.map((r) => ({
      projectId: r.projectId,
      amount: normalizeDecimalInput(String(r.amount)),
      amountVat: normalizeDecimalInput(String(r.amountVat ?? "0")),
      description: r.description,
    }));
    if (allocs?.length) {
      const err = validatePlannedAllocationSums(allocs, mergedMain, mergedVat);
      if (err) return jsonError(err, 400);
    }

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

    let projectId = existing.projectId;
    let projectName = existing.projectName;
    if (data.projectAllocations !== undefined) {
      try {
        const pf = await resolveLegacyProjectFieldsFromAllocations(
          prisma,
          data.projectId !== undefined ? data.projectId : existing.projectId,
          data.projectAllocations,
        );
        projectId = pf.projectId;
        projectName = pf.projectName;
      } catch {
        return jsonError("Nieprawidłowy projekt", 400);
      }
    } else if (data.projectId !== undefined) {
      try {
        const pf = await resolveProjectFields(prisma, data.projectId);
        projectId = pf.projectId;
        projectName = pf.projectName;
      } catch {
        return jsonError("Nieprawidłowy projekt", 400);
      }
    }

    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.plannedFinancialEvent.update({
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
          projectId,
          projectName,
          incomeCategoryId,
          expenseCategoryId,
        },
        include: { incomeCategory: true, expenseCategory: true, project: true },
      });
      if (data.projectAllocations !== undefined) {
        await replacePlannedEventAllocations(tx, id, allocs ?? []);
      }
      return updated;
    });
    const fresh = await prisma.plannedFinancialEvent.findUnique({
      where: { id },
      include: {
        incomeCategory: true,
        expenseCategory: true,
        project: true,
        convertedToIncomeInvoice: { select: { id: true, invoiceNumber: true } },
        convertedToCostInvoice: { select: { id: true, documentNumber: true } },
        projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
      },
    });
    return jsonData(fresh ?? row);
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
