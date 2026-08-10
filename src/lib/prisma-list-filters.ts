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
        { projectName: { contains: q } },
        { project: { name: { contains: q } } },
        { project: { code: { contains: q } } },
        { project: { clientName: { contains: q } } },
      ],
    });
  }
  const status = sp.get("status")?.trim();
  if (status) filters.push({ status });

  const projectId = sp.get("projectId")?.trim();
  if (projectId) {
    filters.push({
      OR: [{ projectId }, { projectAllocations: { some: { projectId } } }],
    });
  }

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
        { projectName: { contains: q } },
        { project: { name: { contains: q } } },
        { project: { code: { contains: q } } },
        { project: { clientName: { contains: q } } },
      ],
    });
  }
  const status = sp.get("status")?.trim();
  if (status) filters.push({ status });

  const projectId = sp.get("projectId")?.trim();
  if (projectId) {
    filters.push({
      OR: [{ projectId }, { projectAllocations: { some: { projectId } } }],
    });
  }

  const uncategorized = sp.get("uncategorized") === "1";
  if (uncategorized) {
    filters.push({ expenseCategoryId: null });
  } else {
    const catsParam = sp.get("categories")?.trim();
    const legacyCat = sp.get("categoryId")?.trim();
    const ids = catsParam
      ? catsParam
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : legacyCat
        ? [legacyCat]
        : [];
    if (ids.length === 1) filters.push({ expenseCategoryId: ids[0]! });
    else if (ids.length > 1) filters.push({ expenseCategoryId: { in: ids } });
  }

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

  const paymentSource = sp.get("paymentSource")?.trim();
  if (paymentSource) filters.push({ paymentSource });

  const costPlaceKind = sp.get("costPlaceKind")?.trim();
  if (costPlaceKind) filters.push({ costPlaceKind });

  const vehicleId = sp.get("vehicleId")?.trim();
  if (vehicleId) filters.push({ vehicleId });

  const account4 = sp.get("account4")?.trim();
  if (account4) {
    filters.push({
      expenseCategory: {
        OR: [
          { accountingCode: { contains: account4 } },
          { name: { contains: account4 } },
          { accountingName: { contains: account4 } },
        ],
      },
    });
  }

  if (q) {
    const idx = filters.findIndex(
      (f) => f.OR && Array.isArray(f.OR) && f.OR.some((x) => "documentNumber" in (x as object)),
    );
    if (idx >= 0) {
      filters[idx] = {
        OR: [
          { documentNumber: { contains: q } },
          { supplier: { contains: q } },
          { description: { contains: q } },
          { projectName: { contains: q } },
          { project: { name: { contains: q } } },
          { project: { code: { contains: q } } },
          { project: { clientName: { contains: q } } },
          { account5Code: { contains: q } },
          { accountingNote: { contains: q } },
          { expenseCategory: { name: { contains: q } } },
          { expenseCategory: { accountingCode: { contains: q } } },
          { expenseCategory: { accountingName: { contains: q } } },
          { vehicle: { registrationNumber: { contains: q } } },
          { vehicle: { make: { contains: q } } },
          { vehicle: { model: { contains: q } } },
          { vehicle: { name: { contains: q } } },
          { projectAllocations: { some: { account5Code: { contains: q } } } },
          { projectAllocations: { some: { project: { code: { contains: q } } } } },
          { projectAllocations: { some: { project: { name: { contains: q } } } } },
        ],
      };
    }
  }

  return filters.length ? { AND: filters } : {};
}

export function buildPlannedWhere(sp: URLSearchParams): Prisma.PlannedFinancialEventWhereInput {
  const filters: Prisma.PlannedFinancialEventWhereInput[] = [];
  const q = sp.get("q")?.trim();
  if (q) {
    filters.push({
      OR: [
        { title: { contains: q } },
        { description: { contains: q } },
        { projectName: { contains: q } },
        { project: { name: { contains: q } } },
        { project: { code: { contains: q } } },
        { project: { clientName: { contains: q } } },
      ],
    });
  }
  const status = sp.get("status")?.trim();
  if (status) filters.push({ status });

  const projectId = sp.get("projectId")?.trim();
  if (projectId) {
    filters.push({
      OR: [{ projectId }, { projectAllocations: { some: { projectId } } }],
    });
  }

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
