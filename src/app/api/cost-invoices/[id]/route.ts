import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { resolveCostInvoiceAmounts, resolveEffectiveVatOnly } from "@/lib/validation/cost-invoice-amounts";
import type { VatRatePct } from "@/lib/vat-rate";
import { costInvoiceUpdateSchema } from "@/lib/validation/schemas";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import {
  assertCostStatusAllowedForPayments,
  ensureClosingCostPaymentIfFullySettled,
} from "@/lib/cashflow/invoice-auto-settlement";
import { decToNumber } from "@/lib/cashflow/money";
import { PAY_EPS, sumCostPaymentsGross } from "@/lib/cashflow/settlement";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.costInvoice.findUnique({
    where: { id },
    include: { expenseCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
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
    const data = costInvoiceUpdateSchema.parse(body);
    const existing = await prisma.costInvoice.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!existing) return jsonError("Nie znaleziono", 404);

    const effectiveVatOnly = resolveEffectiveVatOnly(data, existing);
    const mergedNet = (data.netAmount ?? existing.netAmount).toString();
    const mergedVatAmt = data.vatAmount !== undefined ? String(data.vatAmount) : existing.vatAmount.toString();
    const mergedGross = data.grossAmount !== undefined ? String(data.grossAmount) : existing.grossAmount.toString();
    const mergedRate = (data.vatRate !== undefined ? data.vatRate : existing.vatRate) as VatRatePct;
    const resolved = resolveCostInvoiceAmounts({
      vatOnly: effectiveVatOnly,
      netAmount: mergedNet,
      vatAmount: mergedVatAmt,
      grossAmount: mergedGross,
      vatRate: mergedRate,
    });
    if (!resolved.ok) return jsonError(resolved.message);
    const { net, vat, gross, storedVatRate } = resolved.amounts;
    if (sumCostPaymentsGross(existing.payments) > decToNumber(gross) + PAY_EPS) {
      return jsonError("Suma płatności przekracza nową kwotę brutto — usuń lub zmień płatności.");
    }

    const mergedStatus = data.status ?? existing.status;
    const mergedPaid = data.paid ?? existing.paid;
    try {
      assertCostStatusAllowedForPayments({ grossAmount: gross }, existing.payments, mergedStatus, mergedPaid);
    } catch (e) {
      return jsonError(e instanceof Error ? e.message : "Niedozwolona zmiana statusu", 400);
    }

    const row = await prisma.costInvoice.update({
      where: { id },
      data: {
        documentNumber: data.documentNumber ?? existing.documentNumber,
        supplier: data.supplier ?? existing.supplier,
        description: data.description ?? existing.description,
        vatRate: storedVatRate,
        netAmount: net,
        vatAmount: vat,
        grossAmount: gross,
        documentDate: data.documentDate ? new Date(data.documentDate) : existing.documentDate,
        paymentDueDate: data.paymentDueDate
          ? new Date(data.paymentDueDate)
          : existing.paymentDueDate,
        plannedPaymentDate: data.plannedPaymentDate
          ? new Date(data.plannedPaymentDate)
          : existing.plannedPaymentDate,
        status: data.status ?? existing.status,
        paid: data.paid ?? existing.paid,
        actualPaymentDate:
          data.actualPaymentDate === undefined
            ? existing.actualPaymentDate
            : data.actualPaymentDate
              ? new Date(data.actualPaymentDate)
              : null,
        paymentSource: data.paymentSource ?? existing.paymentSource,
        notes: data.notes ?? existing.notes,
        expenseCategoryId:
          data.expenseCategoryId !== undefined ? data.expenseCategoryId : existing.expenseCategoryId,
        isRecurringDetached:
          data.isRecurringDetached !== undefined ? data.isRecurringDetached : existing.isRecurringDetached,
      },
      include: { expenseCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
    });
    await ensureClosingCostPaymentIfFullySettled(id);
    await syncCostInvoiceStatus(id);
    const fresh = await prisma.costInvoice.findUnique({
      where: { id },
      include: { expenseCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
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
    await prisma.costInvoice.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return jsonError("Nie znaleziono", 404);
  }
}
