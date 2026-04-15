import type { OtherIncome, IncomeCategory, Project } from "@prisma/client";

export type OtherIncomeListRow = {
  id: string;
  date: string;
  amountGross: string;
  vatAmount: string;
  description: string;
  projectId: string | null;
  categoryId: string | null;
  projectName: string | null;
  categoryName: string | null;
  source: string;
  bankTransactionId: string | null;
  /** Tylko w szczegółach — do linku do importu */
  bankImportId: string | null;
};

type RowWithRelations = OtherIncome & {
  project: Pick<Project, "id" | "name"> | null;
  category: Pick<IncomeCategory, "id" | "name"> | null;
  bankTransaction?: { importId: string } | null;
};

export function serializeOtherIncomeRow(r: RowWithRelations): OtherIncomeListRow {
  return {
    id: r.id,
    date: r.date.toISOString(),
    amountGross: r.amountGross.toString(),
    vatAmount: r.vatAmount.toString(),
    description: r.description,
    projectId: r.projectId,
    categoryId: r.categoryId,
    projectName: r.project?.name ?? null,
    categoryName: r.category?.name ?? null,
    source: r.source,
    bankTransactionId: r.bankTransactionId,
    bankImportId: r.bankTransaction?.importId ?? null,
  };
}
