import type { Prisma } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";

function safeDate(s: string | null): Date | null {
  if (!s?.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildIncomeWhere(sp: URLSearchParams): Prisma.IncomeInvoiceWhereInput {
  const filters: Prisma.IncomeInvoiceWhereInput[] = [];
  const q = sp.get("q")?.trim();
  if (q) {
    filters.push({
      OR: [
        { invoiceNumber: { contains: q } },
        { contractor: { contains: q } },
        { description: { contains: q } },
      ],
    });
  }
  const status = sp.get("status")?.trim();
  if (status) filters.push({ status });

  const categoryId = sp.get("categoryId")?.trim();
  if (categoryId) filters.push({ incomeCategoryId: categoryId });

  const dateField = sp.get("dateField") ?? "plannedIncomeDate";
  const allowed = new Set(["plannedIncomeDate", "issueDate", "paymentDueDate"]);
  const field = (allowed.has(dateField) ? dateField : "plannedIncomeDate") as
    | "plannedIncomeDate"
    | "issueDate"
    | "paymentDueDate";
  const from = safeDate(sp.get("dateFrom"));
  const to = safeDate(sp.get("dateTo"));
  if (from || to) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = startOfDay(from);
    if (to) range.lte = endOfDay(to);
    filters.push({ [field]: range });
  }

  if (sp.get("overdue") === "1") {
    const today = startOfDay(new Date());
    filters.push({
      status: { not: "OPLACONA" },
      OR: [{ plannedIncomeDate: { lt: today } }, { paymentDueDate: { lt: today } }],
    });
  }

  const recurringSource = sp.get("recurringSource")?.trim();
  if (recurringSource === "manual") filters.push({ isGeneratedFromRecurring: false });
  if (recurringSource === "generated") filters.push({ isGeneratedFromRecurring: true });

  return filters.length ? { AND: filters } : {};
}

export function buildCostWhere(sp: URLSearchParams): Prisma.CostInvoiceWhereInput {
  const filters: Prisma.CostInvoiceWhereInput[] = [];
  const q = sp.get("q")?.trim();
  if (q) {
    filters.push({
      OR: [
        { documentNumber: { contains: q } },
        { supplier: { contains: q } },
        { description: { contains: q } },
      ],
    });
  }
  const status = sp.get("status")?.trim();
  if (status) filters.push({ status });

  const categoryId = sp.get("categoryId")?.trim();
  if (categoryId) filters.push({ expenseCategoryId: categoryId });

  const dateField = sp.get("dateField") ?? "plannedPaymentDate";
  const allowed = new Set(["plannedPaymentDate", "documentDate", "paymentDueDate"]);
  const field = (allowed.has(dateField) ? dateField : "plannedPaymentDate") as
    | "plannedPaymentDate"
    | "documentDate"
    | "paymentDueDate";
  const from = safeDate(sp.get("dateFrom"));
  const to = safeDate(sp.get("dateTo"));
  if (from || to) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = startOfDay(from);
    if (to) range.lte = endOfDay(to);
    filters.push({ [field]: range });
  }

  if (sp.get("overdue") === "1") {
    const today = startOfDay(new Date());
    filters.push({
      paid: false,
      OR: [{ plannedPaymentDate: { lt: today } }, { paymentDueDate: { lt: today } }],
    });
  }

  const recurringSource = sp.get("recurringSource")?.trim();
  if (recurringSource === "manual") filters.push({ isGeneratedFromRecurring: false });
  if (recurringSource === "generated") filters.push({ isGeneratedFromRecurring: true });

  return filters.length ? { AND: filters } : {};
}

export function buildPlannedWhere(sp: URLSearchParams): Prisma.PlannedFinancialEventWhereInput {
  const filters: Prisma.PlannedFinancialEventWhereInput[] = [];
  const q = sp.get("q")?.trim();
  if (q) {
    filters.push({
      OR: [{ title: { contains: q } }, { description: { contains: q } }],
    });
  }
  const status = sp.get("status")?.trim();
  if (status) filters.push({ status });

  const type = sp.get("type")?.trim();
  if (type === "INCOME" || type === "EXPENSE") filters.push({ type });

  const categoryId = sp.get("categoryId")?.trim();
  if (categoryId) {
    filters.push({
      OR: [{ incomeCategoryId: categoryId }, { expenseCategoryId: categoryId }],
    });
  }

  const from = safeDate(sp.get("dateFrom"));
  const to = safeDate(sp.get("dateTo"));
  if (from || to) {
    const range: Prisma.DateTimeFilter = {};
    if (from) range.gte = startOfDay(from);
    if (to) range.lte = endOfDay(to);
    filters.push({ plannedDate: range });
  }

  if (sp.get("overdue") === "1") {
    const today = startOfDay(new Date());
    filters.push({ status: "PLANNED", plannedDate: { lt: today } });
  }

  return filters.length ? { AND: filters } : {};
}
