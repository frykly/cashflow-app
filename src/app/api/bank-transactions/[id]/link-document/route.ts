import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { z } from "zod";
import { syncCostInvoiceStatus, syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import {
  assertCostLinkSign,
  assertCostPaymentFits,
  assertIncomeLinkSign,
  assertIncomePaymentFits,
  bankGroszeToAmountGross,
  BANK_LINK_PAYMENT_NOTE,
} from "@/lib/bank-import/payment-from-bank";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { finalizeNewCostPaymentAllocations, finalizeNewIncomePaymentAllocations } from "@/lib/payment-project-allocation/finalize";
import { decToNumber } from "@/lib/cashflow/money";
import { validateIncomeManualSplit } from "@/lib/cashflow/validate-income-payment-split";

const bodySchema = z
  .object({
    costInvoiceId: z.string().min(1).optional(),
    incomeInvoiceId: z.string().min(1).optional(),
    incomeSplit: z
      .object({
        allocatedMainAmount: z.union([z.number(), z.string()]),
        allocatedVatAmount: z.union([z.number(), z.string()]),
      })
      .optional(),
  })
  .refine((b) => Boolean(b.costInvoiceId) !== Boolean(b.incomeInvoiceId), {
    message: "Podaj dokładnie jeden: costInvoiceId albo incomeInvoiceId",
  })
  .superRefine((b, ctx) => {
    const hasI = Boolean(b.incomeInvoiceId);
    const hasS = b.incomeSplit != null;
    if (hasS && !hasI) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "incomeSplit tylko z incomeInvoiceId", path: ["incomeSplit"] });
    }
  });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bankTxId } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.flatten().formErrors.join("; ") || "Walidacja", 422);

  const [existingIp, existingCp, existingOi] = await Promise.all([
    prisma.incomeInvoicePayment.findFirst({ where: { bankTransactionId: bankTxId } }),
    prisma.costInvoicePayment.findFirst({ where: { bankTransactionId: bankTxId } }),
    prisma.otherIncome.findUnique({ where: { bankTransactionId: bankTxId } }),
  ]);
  if (existingIp || existingCp || existingOi) {
    return jsonError("Ta transakcja bankowa ma już utworzoną płatność lub przychód bez faktury — użyj „Cofnij”, aby to usunąć.", 409);
  }

  const tx = await prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);

  if (parsed.data.costInvoiceId) {
    try {
      assertCostLinkSign(tx.amount);
    } catch {
      return jsonError("Faktura kosztowa: oczekiwana transakcja ujemna (wypłata z konta).", 400);
    }

    if (tx.linkedCostInvoiceId && tx.linkedCostInvoiceId !== parsed.data.costInvoiceId) {
      return jsonError("Inna faktura kosztowa jest już powiązana — użyj „Cofnij”.", 409);
    }
    if (tx.matchedInvoiceId || tx.createdCostId) {
      return jsonError("Transakcja jest już powiązana z innym dokumentem — użyj „Cofnij”.", 409);
    }

    const inv = await prisma.costInvoice.findUnique({
      where: { id: parsed.data.costInvoiceId },
      include: { payments: true, projectAllocations: true },
    });
    if (!inv) return jsonError("Nie znaleziono faktury kosztowej", 404);

    const amountGross = bankGroszeToAmountGross(tx.amount);
    try {
      assertCostPaymentFits(inv, amountGross);
    } catch {
      return jsonError("Suma płatności przekroczyłaby kwotę brutto faktury kosztowej.", 400);
    }

    const updated = await prisma.$transaction(async (trx) => {
      const payment = await trx.costInvoicePayment.create({
        data: {
          costInvoiceId: inv.id,
          amountGross,
          paymentDate: tx.bookingDate,
          notes: `${BANK_LINK_PAYMENT_NOTE} (${bankTxId.slice(0, 8)}…)`,
          bankTransactionId: bankTxId,
        },
        select: { id: true },
      });
      await finalizeNewCostPaymentAllocations(
        trx,
        inv.id,
        payment.id,
        normalizeDecimalInput(amountGross.toString()),
        null,
      );
      return trx.bankTransaction.update({
        where: { id: bankTxId },
        data: {
          status: "LINKED_COST",
          linkedCostInvoiceId: inv.id,
          matchedInvoiceId: null,
          createdCostId: null,
        },
      });
    });

    await syncCostInvoiceStatus(inv.id);
    return jsonData(updated);
  }

  try {
    assertIncomeLinkSign(tx.amount);
  } catch {
    return jsonError("Faktura przychodowa: oczekiwana transakcja dodatnia (wpłata na konto).", 400);
  }

  if (tx.matchedInvoiceId && tx.matchedInvoiceId !== parsed.data.incomeInvoiceId!) {
    return jsonError("Inna faktura przychodu jest już powiązana — użyj „Cofnij”.", 409);
  }
  if (tx.linkedCostInvoiceId || tx.createdCostId) {
    return jsonError("Transakcja jest już powiązana z dokumentem kosztowym — użyj „Cofnij”.", 409);
  }

  const inv = await prisma.incomeInvoice.findUnique({
    where: { id: parsed.data.incomeInvoiceId! },
    include: { payments: true, projectAllocations: true },
  });
  if (!inv) return jsonError("Nie znaleziono faktury przychodu", 404);

  const amountGross = bankGroszeToAmountGross(tx.amount);
  try {
    assertIncomePaymentFits(inv, amountGross);
  } catch {
    return jsonError("Suma wpłat przekroczyłaby kwotę brutto faktury przychodu.", 400);
  }

  let allocMain: Prisma.Decimal | null = null;
  let allocVat: Prisma.Decimal | null = null;
  if (parsed.data.incomeSplit) {
    const mNorm = normalizeDecimalInput(String(parsed.data.incomeSplit.allocatedMainAmount));
    const vNorm = normalizeDecimalInput(String(parsed.data.incomeSplit.allocatedVatAmount));
    const splitErr = validateIncomeManualSplit(
      inv,
      decToNumber(amountGross),
      decToNumber(mNorm),
      decToNumber(vNorm),
      inv.payments,
    );
    if (splitErr) return jsonError(splitErr, 400);
    allocMain = new Prisma.Decimal(mNorm);
    allocVat = new Prisma.Decimal(vNorm);
  }

  const updated = await prisma.$transaction(async (trx) => {
    const payment = await trx.incomeInvoicePayment.create({
      data: {
        incomeInvoiceId: inv.id,
        amountGross,
        allocatedMainAmount: allocMain,
        allocatedVatAmount: allocVat,
        paymentDate: tx.bookingDate,
        notes: `${BANK_LINK_PAYMENT_NOTE} (${bankTxId.slice(0, 8)}…)`,
        bankTransactionId: bankTxId,
      },
      select: { id: true },
    });
    await finalizeNewIncomePaymentAllocations(
      trx,
      inv.id,
      payment.id,
      normalizeDecimalInput(amountGross.toString()),
      null,
    );
    return trx.bankTransaction.update({
      where: { id: bankTxId },
      data: {
        status: "LINKED_INCOME",
        matchedInvoiceId: inv.id,
        linkedCostInvoiceId: null,
        createdCostId: null,
      },
    });
  });

  await syncIncomeInvoiceStatus(inv.id);
  return jsonData(updated);
}
