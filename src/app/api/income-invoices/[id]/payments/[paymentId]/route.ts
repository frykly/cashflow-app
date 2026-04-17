import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import { decToNumber } from "@/lib/cashflow/money";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { validateIncomeManualSplit } from "@/lib/cashflow/validate-income-payment-split";
import { z } from "zod";
import { ZodError } from "zod";
import { NextResponse } from "next/server";

type Ctx = { params: Promise<{ id: string; paymentId: string }> };

const patchSchema = z
  .object({
    allocatedMainAmount: z.union([z.string(), z.number(), z.null()]).optional(),
    allocatedVatAmount: z.union([z.string(), z.number(), z.null()]).optional(),
  })
  .superRefine((d, ctx) => {
    const a = d.allocatedMainAmount;
    const b = d.allocatedVatAmount;
    const hasA = a !== undefined;
    const hasB = b !== undefined;
    if (hasA !== hasB) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Podaj razem allocatedMainAmount i allocatedVatAmount (lub oba null, aby wyczyścić).",
        path: ["allocatedMainAmount"],
      });
    }
  });

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: invoiceId, paymentId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = patchSchema.parse(body);
    if (data.allocatedMainAmount === undefined && data.allocatedVatAmount === undefined) {
      return jsonError("Brak pól do aktualizacji.", 400);
    }

    const pay = await prisma.incomeInvoicePayment.findFirst({
      where: { id: paymentId, incomeInvoiceId: invoiceId },
    });
    if (!pay) return jsonError("Nie znaleziono", 404);

    const inv = await prisma.incomeInvoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true, projectAllocations: true },
    });
    if (!inv) return jsonError("Nie znaleziono faktury", 404);

    const others = inv.payments.filter((p) => p.id !== paymentId);
    const g = decToNumber(pay.amountGross);

    let allocMain: Prisma.Decimal | null = null;
    let allocVat: Prisma.Decimal | null = null;

    if (data.allocatedMainAmount === null && data.allocatedVatAmount === null) {
      allocMain = null;
      allocVat = null;
    } else if (data.allocatedMainAmount != null && data.allocatedVatAmount != null) {
      const mNorm = normalizeDecimalInput(String(data.allocatedMainAmount));
      const vNorm = normalizeDecimalInput(String(data.allocatedVatAmount));
      const splitErr = validateIncomeManualSplit(inv, g, decToNumber(mNorm), decToNumber(vNorm), others);
      if (splitErr) return jsonError(splitErr, 400);
      allocMain = new Prisma.Decimal(mNorm);
      allocVat = new Prisma.Decimal(vNorm);
    } else {
      return jsonError("Niekompletny podział.", 400);
    }

    const updated = await prisma.incomeInvoicePayment.update({
      where: { id: paymentId },
      data: {
        allocatedMainAmount: allocMain,
        allocatedVatAmount: allocVat,
      },
      include: { projectAllocations: { include: { project: { select: { id: true, name: true } } } } },
    });
    await syncIncomeInvoiceStatus(invoiceId);
    return jsonData(updated);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, paymentId } = await ctx.params;
  const p = await prisma.incomeInvoicePayment.findFirst({
    where: { id: paymentId, incomeInvoiceId: id },
  });
  if (!p) return jsonError("Nie znaleziono", 404);
  await prisma.incomeInvoicePayment.delete({ where: { id: paymentId } });
  await syncIncomeInvoiceStatus(id);
  return new NextResponse(null, { status: 204 });
}
