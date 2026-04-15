import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import type { Project } from "@prisma/client";

export type ProjectListSortKey =
  | "code"
  | "name"
  | "clientName"
  | "lifecycleStatus"
  | "settlementStatus"
  | "plannedRevenueNet"
  | "plannedCostNet"
  | "paidTotal"
  | "actualResult";

export type ProjectListRow = Project & {
  paidTotalGross: number;
  /** null = brak powiązanych faktur (przychód ani koszt) */
  actualResultNet: number | null;
};

function nullsLastCompare(a: number | null, b: number | null, order: "asc" | "desc"): number {
  const na = a == null ? (order === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : a;
  const nb = b == null ? (order === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : b;
  return order === "asc" ? na - nb : nb - na;
}

function strNullsLast(a: string | null, b: string | null, order: "asc" | "desc"): number {
  const sa = a ?? (order === "asc" ? "\uFFFF" : "");
  const sb = b ?? (order === "asc" ? "\uFFFF" : "");
  return order === "asc" ? sa.localeCompare(sb, "pl") : sb.localeCompare(sa, "pl");
}

export async function listProjectsEnriched(options: {
  q?: string;
  active?: string | null;
  includeSettled: boolean;
  sort: ProjectListSortKey;
  order: "asc" | "desc";
}): Promise<ProjectListRow[]> {
  const { q, active, includeSettled, sort, order } = options;

  const filters: Prisma.ProjectWhereInput[] = [];
  if (!includeSettled) {
    filters.push({
      NOT: {
        AND: [{ lifecycleStatus: "COMPLETED" }, { settlementStatus: "SETTLED" }],
      },
    });
  }
  if (q?.trim()) {
    const s = q.trim();
    filters.push({
      OR: [{ name: { contains: s } }, { code: { contains: s } }, { clientName: { contains: s } }],
    });
  }
  if (active === "1" || active === "true") filters.push({ isActive: true });
  if (active === "0" || active === "false") filters.push({ isActive: false });

  const where = filters.length ? { AND: filters } : {};

  const projects = await prisma.project.findMany({ where });
  if (projects.length === 0) return [];

  const ids = projects.map((p) => p.id);

  const [incomeAllocSums, costAllocSums, incInvoices, costInvs] = await Promise.all([
    prisma.incomeInvoiceProjectAllocation.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids } },
      _sum: { netAmount: true },
    }),
    prisma.costInvoiceProjectAllocation.groupBy({
      by: ["projectId"],
      where: { projectId: { in: ids } },
      _sum: { netAmount: true },
    }),
    prisma.incomeInvoice.findMany({
      where: {
        projectId: { in: ids },
        projectAllocations: { none: {} },
      },
      select: { projectId: true, netAmount: true, payments: { select: { amountGross: true } } },
    }),
    prisma.costInvoice.findMany({
      where: {
        projectId: { in: ids },
        projectAllocations: { none: {} },
      },
      select: { projectId: true, netAmount: true, payments: { select: { amountGross: true } } },
    }),
  ]);

  const incNet = new Map<string, number>();
  for (const id of ids) incNet.set(id, 0);
  for (const g of incomeAllocSums) {
    if (g.projectId) incNet.set(g.projectId, decToNumber(g._sum.netAmount ?? 0));
  }
  for (const row of incInvoices) {
    if (!row.projectId) continue;
    incNet.set(row.projectId, (incNet.get(row.projectId) ?? 0) + decToNumber(row.netAmount));
  }

  const coNet = new Map<string, number>();
  for (const id of ids) coNet.set(id, 0);
  for (const g of costAllocSums) {
    if (g.projectId) coNet.set(g.projectId, decToNumber(g._sum.netAmount ?? 0));
  }
  for (const row of costInvs) {
    if (!row.projectId) continue;
    coNet.set(row.projectId, (coNet.get(row.projectId) ?? 0) + decToNumber(row.netAmount));
  }

  const incForPaid = await prisma.incomeInvoice.findMany({
    where: {
      OR: [
        { projectId: { in: ids }, projectAllocations: { none: {} } },
        { projectAllocations: { some: { projectId: { in: ids } } } },
      ],
    },
    select: {
      projectId: true,
      payments: { select: { amountGross: true } },
      projectAllocations: { select: { projectId: true } },
    },
  });
  const costForPaid = await prisma.costInvoice.findMany({
    where: {
      OR: [
        { projectId: { in: ids }, projectAllocations: { none: {} } },
        { projectAllocations: { some: { projectId: { in: ids } } } },
      ],
    },
    select: {
      projectId: true,
      payments: { select: { amountGross: true } },
      projectAllocations: { select: { projectId: true } },
    },
  });

  const paidIncome = new Map<string, number>();
  for (const id of ids) paidIncome.set(id, 0);
  for (const row of incForPaid) {
    const alloc = row.projectAllocations;
    if (alloc.length > 1) continue;
    const targetPid = alloc.length === 1 ? alloc[0]!.projectId : row.projectId;
    if (!targetPid || !ids.includes(targetPid)) continue;
    const s = row.payments.reduce((acc, p) => acc + decToNumber(p.amountGross), 0);
    paidIncome.set(targetPid, (paidIncome.get(targetPid) ?? 0) + s);
  }
  const paidCost = new Map<string, number>();
  for (const id of ids) paidCost.set(id, 0);
  for (const row of costForPaid) {
    const alloc = row.projectAllocations;
    if (alloc.length > 1) continue;
    const targetPid = alloc.length === 1 ? alloc[0]!.projectId : row.projectId;
    if (!targetPid || !ids.includes(targetPid)) continue;
    const s = row.payments.reduce((acc, p) => acc + decToNumber(p.amountGross), 0);
    paidCost.set(targetPid, (paidCost.get(targetPid) ?? 0) + s);
  }

  const enriched: ProjectListRow[] = projects.map((p) => {
    const inN = incNet.get(p.id);
    const cN = coNet.get(p.id);
    const incomeN = inN ?? 0;
    const costN = cN ?? 0;
    const paidG = (paidIncome.get(p.id) ?? 0) + (paidCost.get(p.id) ?? 0);
    const hasInvoices = incomeN !== 0 || costN !== 0 || paidG > 0;
    return {
      ...p,
      paidTotalGross: paidG,
      actualResultNet: hasInvoices ? incomeN - costN : null,
    };
  });

  const cmp = (a: ProjectListRow, b: ProjectListRow): number => {
    switch (sort) {
      case "code":
        return strNullsLast(a.code, b.code, order);
      case "name":
        return strNullsLast(a.name, b.name, order);
      case "clientName":
        return strNullsLast(a.clientName, b.clientName, order);
      case "lifecycleStatus":
        return strNullsLast(a.lifecycleStatus, b.lifecycleStatus, order);
      case "settlementStatus":
        return strNullsLast(a.settlementStatus, b.settlementStatus, order);
      case "plannedRevenueNet":
        return nullsLastCompare(
          a.plannedRevenueNet != null ? decToNumber(a.plannedRevenueNet) : null,
          b.plannedRevenueNet != null ? decToNumber(b.plannedRevenueNet) : null,
          order,
        );
      case "plannedCostNet":
        return nullsLastCompare(
          a.plannedCostNet != null ? decToNumber(a.plannedCostNet) : null,
          b.plannedCostNet != null ? decToNumber(b.plannedCostNet) : null,
          order,
        );
      case "paidTotal":
        return nullsLastCompare(a.paidTotalGross, b.paidTotalGross, order);
      case "actualResult":
        return nullsLastCompare(
          a.actualResultNet ?? null,
          b.actualResultNet ?? null,
          order,
        );
      default:
        return strNullsLast(a.name, b.name, order);
    }
  };

  enriched.sort(cmp);
  return enriched;
}
