import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { healBankTransactionLinks } from "@/lib/bank-import/heal-links";
import { explainBankTransactionDedupe } from "@/lib/bank-import/dedupe-explain";
import { z } from "zod";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const existing = await prisma.bankTransaction.findUnique({ where: { id }, select: { importId: true } });
  if (!existing) return jsonError("Nie znaleziono transakcji", 404);
  await healBankTransactionLinks(prisma, existing.importId);

  const tx = await prisma.bankTransaction.findUnique({
    where: { id },
    include: {
      import: { select: { id: true, fileName: true, createdAt: true } },
    },
  });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);

  const payment = await prisma.costInvoicePayment.findFirst({
    where: { bankTransactionId: id },
    select: {
      id: true,
      amountGross: true,
      costInvoiceId: true,
      costInvoice: { select: { id: true, documentNumber: true, supplier: true } },
    },
  });

  const linkedCost =
    tx.linkedCostInvoiceId ?
      await prisma.costInvoice.findUnique({
        where: { id: tx.linkedCostInvoiceId },
        select: { id: true, documentNumber: true, supplier: true },
      })
    : null;

  const matchedIncome =
    tx.matchedInvoiceId ?
      await prisma.incomeInvoice.findUnique({
        where: { id: tx.matchedInvoiceId },
        select: { id: true, invoiceNumber: true, contractor: true },
      })
    : null;

  const createdCost =
    tx.createdCostId ?
      await prisma.costInvoice.findUnique({
        where: { id: tx.createdCostId },
        select: { id: true, documentNumber: true, supplier: true },
      })
    : null;

  const otherIncome = await prisma.otherIncome.findUnique({
    where: { bankTransactionId: id },
    select: { id: true, description: true, amountGross: true, vatAmount: true },
  });

  const dedupe = explainBankTransactionDedupe({
    accountType: tx.accountType,
    bookingDate: tx.bookingDate,
    amount: tx.amount,
    description: tx.description,
    dedupeInputText: tx.dedupeInputText,
    counterpartyName: tx.counterpartyName,
    counterpartyAccount: tx.counterpartyAccount,
    dedupeKey: tx.dedupeKey,
  });

  return jsonData({
    ...tx,
    dedupe,
    links: {
      payment,
      linkedCost,
      matchedIncome,
      createdCost,
      otherIncome,
    },
  });
}

const statuses = z.enum([
  "NEW",
  "MATCHED",
  "LINKED_COST",
  "LINKED_INCOME",
  "LINKED_OTHER_INCOME",
  "TRANSFER",
  "VAT_TOPUP",
  "IGNORED",
  "DUPLICATE",
  "BROKEN_LINK",
  "CREATED",
]);

const patchSchema = z.object({
  status: statuses,
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Nieprawidłowy status", 422);

  const existing = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!existing) return jsonError("Nie znaleziono transakcji", 404);

  let normalized = parsed.data.status;
  if (normalized === "CREATED") normalized = "LINKED_COST";

  const updated = await prisma.bankTransaction.update({
    where: { id },
    data: { status: normalized },
  });
  await healBankTransactionLinks(prisma, updated.importId);
  const healed = await prisma.bankTransaction.findUnique({ where: { id } });
  return jsonData(healed ?? updated);
}
