import type { Prisma } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import { inferCostPlaceKind, resolveCostInvoiceAccount5Fields } from "@/lib/accounting/resolve-cost-account5";
import {
  replaceCostInvoiceAllocations,
  resolveLegacyProjectFieldsFromAllocations,
} from "@/lib/project-allocations/persist";
import type { ResolvedCostAmounts } from "@/lib/validation/cost-invoice-amounts";
import type { costInvoiceCreateSchema } from "@/lib/validation/schemas";
import type { z } from "zod";

export type CostInvoiceCreateParsed = z.infer<typeof costInvoiceCreateSchema>;

export type CreateCostInvoiceCoreInput = {
  data: CostInvoiceCreateParsed;
  amounts: ResolvedCostAmounts;
  amountToPayGross?: Decimal | number | null;
};

/**
 * Tworzy fakturę kosztową w istniejącej transakcji: alokacje, snapshot konta 5, legacy project fields.
 * Nie wywołuje sync statusu ani planned-event conversion — to robi wywołujący.
 */
export async function createCostInvoiceCore(
  tx: Prisma.TransactionClient,
  input: CreateCostInvoiceCoreInput,
) {
  const { data, amounts, amountToPayGross } = input;
  const allocs = data.projectAllocations;

  const pf = await resolveLegacyProjectFieldsFromAllocations(tx, data.projectId, allocs);
  const placeKind = inferCostPlaceKind({
    costPlaceKind: data.costPlaceKind,
    projectId: pf.projectId,
    allocationCount: allocs?.length ?? 0,
  });

  const created = await tx.costInvoice.create({
    data: {
      documentNumber: data.documentNumber,
      supplier: data.supplier,
      description: data.description ?? "",
      vatRate: amounts.storedVatRate,
      netAmount: amounts.net,
      vatAmount: amounts.vat,
      grossAmount: amounts.gross,
      amountToPayGross: amountToPayGross ?? undefined,
      documentDate: new Date(data.documentDate),
      paymentDueDate: new Date(data.paymentDueDate),
      plannedPaymentDate: new Date(data.plannedPaymentDate),
      status: data.status,
      paid: data.paid ?? false,
      actualPaymentDate: data.actualPaymentDate ? new Date(data.actualPaymentDate) : null,
      paymentSource: data.paymentSource,
      notes: data.notes ?? "",
      accountingNote: data.accountingNote ?? "",
      costPlaceKind: placeKind,
      account5Code: null,
      projectId: pf.projectId,
      projectName: pf.projectName,
      expenseCategoryId: data.expenseCategoryId ?? null,
      vehicleId: data.vehicleId ?? null,
    },
    include: { expenseCategory: true, project: true, vehicle: true, payments: true },
  });

  await replaceCostInvoiceAllocations(tx, created.id, allocs ?? []);

  const allocRows = await tx.costInvoiceProjectAllocation.findMany({
    where: { costInvoiceId: created.id },
    select: { account5Code: true },
  });

  const projectCode = created.projectId
    ? (
        await tx.project.findUnique({
          where: { id: created.projectId },
          select: { code: true },
        })
      )?.code ?? null
    : null;

  const acc = await resolveCostInvoiceAccount5Fields({
    costPlaceKind: placeKind,
    projectId: created.projectId,
    allocationAccount5Codes: allocRows.map((a) => a.account5Code),
    fetchProjectCode: async () => projectCode,
  });

  return tx.costInvoice.update({
    where: { id: created.id },
    data: { costPlaceKind: acc.costPlaceKind, account5Code: acc.account5Code },
    include: {
      expenseCategory: true,
      project: true,
      vehicle: true,
      payments: true,
      projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
    },
  });
}
