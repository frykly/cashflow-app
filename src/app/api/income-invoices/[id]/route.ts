import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { grossFromNetAndRate, vatFromNetAndRate } from "@/lib/validation/gross";
import type { VatRatePct } from "@/lib/vat-rate";
import { incomeInvoiceUpdateSchema } from "@/lib/validation/schemas";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import {
  assertIncomeStatusAllowedForPayments,
  ensureClosingIncomePaymentIfFullySettled,
} from "@/lib/cashflow/invoice-auto-settlement";
import { decToNumber } from "@/lib/cashflow/money";
import { PAY_EPS, sumIncomePaymentsGross } from "@/lib/cashflow/settlement";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { resolveProjectFields } from "@/lib/project-persist";
import { replaceIncomeInvoiceAllocations, resolveLegacyProjectFieldsFromAllocations } from "@/lib/project-allocations/persist";
import { validateCostOrIncomeAllocationSums } from "@/lib/project-allocations/validate";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.incomeInvoice.findUnique({
    where: { id },
    include: {
      incomeCategory: true,
      project: true,
      payments: { orderBy: { paymentDate: "asc" } },
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
    const data = incomeInvoiceUpdateSchema.parse(body);
    const existing = await prisma.incomeInvoice.findUnique({
      where: { id },
      include: { payments: true, projectAllocations: { select: { id: true } } },
    });
    if (!existing) return jsonError("Nie znaleziono", 404);

    const rate = (data.vatRate !== undefined ? data.vatRate : existing.vatRate) as VatRatePct;
    const net = (data.netAmount ?? existing.netAmount).toString();
    const vat = vatFromNetAndRate(net, rate);
    const gross = grossFromNetAndRate(net, rate);

    const hadAlloc = existing.projectAllocations.length > 0;
    const netChanged =
      data.netAmount !== undefined &&
      normalizeDecimalInput(String(data.netAmount)) !== normalizeDecimalInput(existing.netAmount.toString());
    if (hadAlloc && netChanged && data.projectAllocations === undefined) {
      return jsonError(
        "Ta faktura ma alokacje projektów — po zmianie kwot wyślij ponownie pole „projectAllocations” z pełnym podziałem lub usuń alokacje (pusta tablica).",
        400,
      );
    }

    const allocs = data.projectAllocations;
    if (allocs?.length) {
      const err = validateCostOrIncomeAllocationSums(allocs, net, gross.toString());
      if (err) return jsonError(err, 400);
    }

    if (sumIncomePaymentsGross(existing.payments) > decToNumber(gross) + PAY_EPS) {
      return jsonError("Suma wpłat przekracza nową kwotę brutto — usuń lub zmień wpłaty.");
    }

    const mergedStatus = data.status ?? existing.status;
    try {
      assertIncomeStatusAllowedForPayments({ grossAmount: gross }, existing.payments, mergedStatus);
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Niedozwolona zmiana statusu", 400);
    }

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
      const updated = await tx.incomeInvoice.update({
        where: { id },
        data: {
          invoiceNumber: data.invoiceNumber ?? existing.invoiceNumber,
          contractor: data.contractor ?? existing.contractor,
          description: data.description ?? existing.description,
          vatRate: data.vatRate !== undefined ? data.vatRate : existing.vatRate,
          netAmount: data.netAmount ?? existing.netAmount,
          vatAmount: vat,
          grossAmount: gross,
          issueDate: data.issueDate ? new Date(data.issueDate) : existing.issueDate,
          paymentDueDate: data.paymentDueDate
            ? new Date(data.paymentDueDate)
            : existing.paymentDueDate,
          plannedIncomeDate: data.plannedIncomeDate
            ? new Date(data.plannedIncomeDate)
            : existing.plannedIncomeDate,
          status: data.status ?? existing.status,
          vatDestination: data.vatDestination ?? existing.vatDestination,
          confirmedIncome: data.confirmedIncome ?? existing.confirmedIncome,
          actualIncomeDate:
            data.actualIncomeDate === undefined
              ? existing.actualIncomeDate
              : data.actualIncomeDate
                ? new Date(data.actualIncomeDate)
                : null,
          notes: data.notes ?? existing.notes,
          projectId,
          projectName,
          incomeCategoryId:
            data.incomeCategoryId !== undefined ? data.incomeCategoryId : existing.incomeCategoryId,
          isRecurringDetached:
            data.isRecurringDetached !== undefined ? data.isRecurringDetached : existing.isRecurringDetached,
        },
        include: { incomeCategory: true, project: true, payments: { orderBy: { paymentDate: "asc" } } },
      });
      if (data.projectAllocations !== undefined) {
        await replaceIncomeInvoiceAllocations(tx, id, data.projectAllocations);
      }
      return updated;
    });
    await ensureClosingIncomePaymentIfFullySettled(id);
    await syncIncomeInvoiceStatus(id);
    const fresh = await prisma.incomeInvoice.findUnique({
      where: { id },
      include: {
        incomeCategory: true,
        project: true,
        payments: { orderBy: { paymentDate: "asc" } },
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
    await prisma.incomeInvoice.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return jsonError("Nie znaleziono", 404);
  }
}
