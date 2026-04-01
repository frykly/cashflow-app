import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { resolveCostInvoiceAmounts } from "@/lib/validation/cost-invoice-amounts";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { resolveProjectFields } from "@/lib/project-persist";
import type { VatRatePct } from "@/lib/vat-rate";
import { healBankTransactionLinks } from "@/lib/bank-import/heal-links";
import { assertCostLinkSign, BANK_COST_PAYMENT_NOTE } from "@/lib/bank-import/payment-from-bank";
import { inferDocumentNumberFromBankText } from "@/lib/bank-import/parse-document-number";
import { isExpenseCategoryBankFeesLike, looksLikeBankFeeDescription } from "@/lib/bank-import/bank-fee-heuristic";
import { z } from "zod";

const createCostBodySchema = z.object({
  documentNumber: z.string().max(120).optional().nullable(),
  supplier: z.string().max(500).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  expenseCategoryId: z.string().uuid().optional().nullable(),
  projectId: z.string().min(1).optional().nullable(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bankTxId } = await ctx.params;

  let bodyRaw: unknown = {};
  try {
    const t = await req.text();
    if (t.trim()) bodyRaw = JSON.parse(t) as unknown;
  } catch {
    return jsonError("Nieprawidłowy JSON", 400);
  }

  const parsedBody = createCostBodySchema.safeParse(bodyRaw);
  if (!parsedBody.success) return jsonError("Nieprawidłowe pola formularza", 422);

  const tx = await prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);

  try {
    assertCostLinkSign(tx.amount);
  } catch {
    return jsonError("Koszt z wyciągu: oczekiwana transakcja ujemna (wypłata).", 400);
  }

  await healBankTransactionLinks(prisma, tx.importId);
  const fresh = await prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
  if (!fresh) return jsonError("Nie znaleziono transakcji", 404);

  if (fresh.linkedCostInvoiceId) {
    return jsonError("Transakcja jest już powiązana z fakturą kosztową — użyj „Cofnij powiązanie”.", 409);
  }
  if (fresh.createdCostId) {
    const existing = await prisma.costInvoice.findUnique({ where: { id: fresh.createdCostId } });
    if (existing) return jsonError("Koszt został już utworzony dla tej transakcji", 409);
  }
  if (["VAT_TOPUP", "DUPLICATE", "IGNORED"].includes(fresh.status)) {
    return jsonError("Ten status nie pozwala na utworzenie kosztu z tej transakcji.", 400);
  }

  const payExisting = await prisma.costInvoicePayment.findFirst({ where: { bankTransactionId: bankTxId } });
  if (payExisting) return jsonError("Dla tej transakcji istnieje już płatność — użyj „Cofnij”.", 409);

  const absGrosze = Math.abs(fresh.amount);
  if (absGrosze === 0) return jsonError("Kwota 0 — nie można utworzyć kosztu", 400);

  const grossPln = new Decimal(absGrosze).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const resolved = resolveCostInvoiceAmounts({
    vatOnly: false,
    netAmount: grossPln.toString(),
    vatRate: 0 as VatRatePct,
  });
  if (!resolved.ok) return jsonError(resolved.message);

  const { net, vat, gross, storedVatRate } = resolved.amounts;

  const b = parsedBody.data;
  const inferredDoc = inferDocumentNumberFromBankText(fresh.description);
  const docInput = b.documentNumber?.trim();
  const documentNumber = (docInput || inferredDoc || `BANK-${fresh.id.slice(0, 12)}`).slice(0, 120);
  const description = (b.description?.trim() ?? fresh.description.trim()).slice(0, 2000);

  let expenseCategoryId: string | null = b.expenseCategoryId ?? null;
  let categoryRow: { id: string; name: string; slug: string } | null = null;
  if (expenseCategoryId) {
    const cat = await prisma.expenseCategory.findUnique({
      where: { id: expenseCategoryId },
      select: { id: true, name: true, slug: true },
    });
    if (!cat) return jsonError("Nie znaleziono kategorii kosztu", 400);
    categoryRow = cat;
  }

  const descForHeur = (b.description?.trim() ?? fresh.description).trim();
  const bankFeeContext =
    (categoryRow && isExpenseCategoryBankFeesLike(categoryRow)) || looksLikeBankFeeDescription(descForHeur);

  const supplierTrim = b.supplier?.trim() ?? "";
  const supplier = (
    supplierTrim ||
    (bankFeeContext ? "Bank (opłata lub prowizja)" : fresh.counterpartyName?.trim() || "Wyciąg bankowy")
  ).slice(0, 500);

  let pf: { projectId: string | null; projectName: string | null };
  try {
    const pid = b.projectId?.trim() || null;
    pf = await resolveProjectFields(prisma, pid);
  } catch {
    return jsonError("Nieprawidłowy projekt", 400);
  }

  const docDate = fresh.bookingDate;

  const row = await prisma.$transaction(async (trx) => {
    const cost = await trx.costInvoice.create({
      data: {
        documentNumber,
        supplier,
        description,
        vatRate: storedVatRate,
        netAmount: net,
        vatAmount: vat,
        grossAmount: gross,
        documentDate: docDate,
        paymentDueDate: docDate,
        plannedPaymentDate: docDate,
        status: "DO_ZAPLATY",
        paid: false,
        actualPaymentDate: null,
        paymentSource: fresh.accountType === "VAT" ? "VAT" : "MAIN",
        notes: "",
        projectId: pf.projectId,
        projectName: pf.projectName,
        expenseCategoryId,
      },
    });

    await trx.costInvoicePayment.create({
      data: {
        costInvoiceId: cost.id,
        amountGross: gross,
        paymentDate: docDate,
        notes: `${BANK_COST_PAYMENT_NOTE} (${bankTxId.slice(0, 8)}…)`,
        bankTransactionId: bankTxId,
      },
    });

    const bankRow = await trx.bankTransaction.update({
      where: { id: fresh.id },
      data: {
        status: "LINKED_COST",
        createdCostId: cost.id,
        linkedCostInvoiceId: null,
      },
    });

    return { cost, bankRow };
  });

  await syncCostInvoiceStatus(row.cost.id);

  const freshCost = await prisma.costInvoice.findUnique({
    where: { id: row.cost.id },
    include: { expenseCategory: true, project: true, payments: { orderBy: { paymentDate: "asc" } } },
  });

  return jsonData(
    {
      bankTransaction: row.bankRow,
      costInvoice: freshCost ?? row.cost,
    },
    { status: 201 },
  );
}
