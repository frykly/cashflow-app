import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { resolveCostInvoiceAmounts } from "@/lib/validation/cost-invoice-amounts";
import { ensureClosingCostPaymentIfFullySettled } from "@/lib/cashflow/invoice-auto-settlement";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { resolveProjectFields } from "@/lib/project-persist";
import type { VatRatePct } from "@/lib/vat-rate";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const tx = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);
  if (tx.createdCostId) return jsonError("Koszt został już utworzony dla tej transakcji", 409);

  const absGrosze = Math.abs(tx.amount);
  if (absGrosze === 0) return jsonError("Kwota 0 — nie można utworzyć kosztu", 400);

  const grossPln = new Decimal(absGrosze).div(100);
  const netPln = grossPln.div(new Decimal("1.23")).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const resolved = resolveCostInvoiceAmounts({
    vatOnly: false,
    netAmount: netPln.toString(),
    vatRate: 23 as VatRatePct,
  });
  if (!resolved.ok) return jsonError(resolved.message);

  const { net, vat, gross, storedVatRate } = resolved.amounts;
  const pf = await resolveProjectFields(prisma, null);

  const docDate = tx.bookingDate;
  const supplier = (tx.counterpartyName?.trim() || "Wyciąg bankowy").slice(0, 500);
  const description = tx.description.trim().slice(0, 2000);

  const documentNumber = `BANK-${tx.id.slice(0, 12)}`;

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
        status: "PLANOWANA",
        paid: false,
        actualPaymentDate: null,
        paymentSource: tx.accountType === "VAT" ? "VAT" : "MAIN",
        notes: "",
        projectId: pf.projectId,
        projectName: pf.projectName,
        expenseCategoryId: null,
      },
    });

    const bankRow = await trx.bankTransaction.update({
      where: { id: tx.id },
      data: {
        status: "CREATED",
        createdCostId: cost.id,
      },
    });

    return { cost, bankRow };
  });

  await ensureClosingCostPaymentIfFullySettled(row.cost.id);
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
