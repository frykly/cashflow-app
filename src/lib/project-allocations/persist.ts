import type { Prisma, PrismaClient } from "@prisma/client";
import { account5FromProjectCode } from "@/lib/accounting/account-codes";
import { resolveProjectFields } from "@/lib/project-persist";

export type CostAllocInput = {
  projectId: string;
  netAmount: string;
  grossAmount: string;
  description?: string;
};

export type IncomeAllocInput = CostAllocInput;

export type PlannedAllocInput = {
  projectId: string;
  amount: string;
  amountVat: string;
  description?: string;
};

export async function replaceCostInvoiceAllocations(
  tx: Prisma.TransactionClient,
  costInvoiceId: string,
  rows: CostAllocInput[],
): Promise<void> {
  await tx.costInvoiceProjectAllocation.deleteMany({ where: { costInvoiceId } });
  if (rows.length === 0) return;
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const projects = await tx.project.findMany({
    where: { id: { in: projectIds } },
    select: { id: true, code: true },
  });
  const codeById = new Map(projects.map((p) => [p.id, p.code]));
  await tx.costInvoiceProjectAllocation.createMany({
    data: rows.map((r) => ({
      costInvoiceId,
      projectId: r.projectId,
      netAmount: r.netAmount,
      grossAmount: r.grossAmount,
      description: r.description?.trim() ?? "",
      account5Code: account5FromProjectCode(codeById.get(r.projectId) ?? null),
    })),
  });
}

export async function replaceIncomeInvoiceAllocations(
  tx: Prisma.TransactionClient,
  incomeInvoiceId: string,
  rows: IncomeAllocInput[],
): Promise<void> {
  await tx.incomeInvoiceProjectAllocation.deleteMany({ where: { incomeInvoiceId } });
  if (rows.length === 0) return;
  await tx.incomeInvoiceProjectAllocation.createMany({
    data: rows.map((r) => ({
      incomeInvoiceId,
      projectId: r.projectId,
      netAmount: r.netAmount,
      grossAmount: r.grossAmount,
      description: r.description?.trim() ?? "",
    })),
  });
}

export async function replacePlannedEventAllocations(
  tx: Prisma.TransactionClient,
  plannedFinancialEventId: string,
  rows: PlannedAllocInput[],
): Promise<void> {
  await tx.plannedEventProjectAllocation.deleteMany({ where: { plannedFinancialEventId } });
  if (rows.length === 0) return;
  await tx.plannedEventProjectAllocation.createMany({
    data: rows.map((r) => ({
      plannedFinancialEventId,
      projectId: r.projectId,
      amount: r.amount,
      amountVat: r.amountVat,
      description: r.description?.trim() ?? "",
    })),
  });
}

/** Legacy projectId / projectName na dokumencie: jedna alokacja → ten projekt; wiele → null; brak alokacji → pole formularza. */
export async function resolveLegacyProjectFieldsFromAllocations(
  db: Prisma.TransactionClient | PrismaClient,
  projectIdFromForm: string | null | undefined,
  allocationRows: { projectId: string }[] | undefined,
): Promise<{ projectId: string | null; projectName: string | null }> {
  if (allocationRows && allocationRows.length > 0) {
    if (allocationRows.length === 1) {
      return resolveProjectFields(db, allocationRows[0]!.projectId);
    }
    return { projectId: null, projectName: null };
  }
  return resolveProjectFields(db, projectIdFromForm ?? null);
}
