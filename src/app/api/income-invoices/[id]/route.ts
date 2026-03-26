import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { grossFromNetAndRate, vatFromNetAndRate } from "@/lib/validation/gross";
import type { VatRatePct } from "@/lib/vat-rate";
import { incomeInvoiceUpdateSchema } from "@/lib/validation/schemas";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import { decToNumber } from "@/lib/cashflow/money";
import { PAY_EPS, sumIncomePaymentsGross } from "@/lib/cashflow/settlement";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.incomeInvoice.findUnique({
    where: { id },
    include: { incomeCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
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
      include: { payments: true },
    });
    if (!existing) return jsonError("Nie znaleziono", 404);

    const rate = (data.vatRate !== undefined ? data.vatRate : existing.vatRate) as VatRatePct;
    const net = (data.netAmount ?? existing.netAmount).toString();
    const vat = vatFromNetAndRate(net, rate);
    const gross = grossFromNetAndRate(net, rate);
    if (sumIncomePaymentsGross(existing.payments) > decToNumber(gross) + PAY_EPS) {
      return jsonError("Suma wpłat przekracza nową kwotę brutto — usuń lub zmień wpłaty.");
    }

    const row = await prisma.incomeInvoice.update({
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
        incomeCategoryId:
          data.incomeCategoryId !== undefined ? data.incomeCategoryId : existing.incomeCategoryId,
        isRecurringDetached:
          data.isRecurringDetached !== undefined ? data.isRecurringDetached : existing.isRecurringDetached,
      },
      include: { incomeCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
    });
    await syncIncomeInvoiceStatus(id);
    const fresh = await prisma.incomeInvoice.findUnique({
      where: { id },
      include: { incomeCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
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
