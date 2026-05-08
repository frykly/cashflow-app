import { prisma } from "@/lib/db";
import { endOfDay, startOfDay } from "date-fns";
import { plannedDayStartMs, todayStartMs, type ProjectTaskRow } from "@/lib/projects/project-task-ui";

export const OVERDUE_TASK_LIST_LIMIT = 8;
export const ATTENTION_PROJECTS_LIMIT = 12;
export const STALE_PROJECT_LIST_LIMIT = 8;
export const STALE_ACTIVITY_DAYS = 14;

/** Status realizacji wymagający uwagi (slug z bazy / słownika). */
export function isLifecycleAttentionSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const u = slug.toUpperCase();
  if (u === "DO_WYJASNIENIA") return true;
  if (u.startsWith("OCZEKIW") || u.startsWith("OCZEKUW")) return true;
  if (u.includes("BLOKADA")) return true;
  return false;
}

/** Status rozliczenia sugerujący blokadę / oczekiwanie (slug z bazy). */
export function isSettlementAttentionSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const u = slug.toUpperCase();
  if (u.includes("BLOKADA")) return true;
  if (u.startsWith("OCZEKIW") || u.startsWith("OCZEKUW")) return true;
  return false;
}

/** Zadanie na dashboardzie operacyjnym — pełne pola pod modal edycji + kontekst projektu. */
export type OperationalListTask = ProjectTaskRow & {
  projectId: string;
  projectName: string;
  daysOverdue?: number;
};

export type OperationalAttentionProject = {
  id: string;
  name: string;
  lifecycleStatus: string | null;
  settlementStatus: string | null;
  lifecycleLabel: string;
  settlementLabel: string;
  overdueTaskCount: number;
  activeMissingCount: number;
};

export type OperationalStaleProject = {
  id: string;
  name: string;
  lifecycleStatus: string | null;
  settlementStatus: string | null;
  lifecycleLabel: string;
  settlementLabel: string;
  lastActivityAt: string;
};

function maxTime(d: Date | null | undefined): number {
  if (!d) return 0;
  return d.getTime();
}

function bumpLastActivity(map: Record<string, number>, projectId: string | null | undefined, t: number) {
  if (!projectId || !Number.isFinite(t) || t <= 0) return;
  map[projectId] = Math.max(map[projectId] ?? 0, t);
}

function isTaskTodayFromDb(task: {
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  isDone: boolean;
}): boolean {
  if (task.isDone) return false;
  const t0 = todayStartMs();
  for (const d of [task.plannedStartDate, task.plannedEndDate]) {
    if (!d) continue;
    const p = plannedDayStartMs(d.toISOString());
    if (p !== null && p === t0) return true;
  }
  return false;
}

function prioritySort(a: string | null, b: string | null): number {
  const r = (p: string | null) => (p === "HIGH" ? 0 : p === "NORMAL" ? 1 : 2);
  return r(a) - r(b);
}

function dictLabel(m: Map<string, string>, slug: string | null | undefined): string {
  if (!slug) return "—";
  return m.get(slug) ?? slug;
}

function prismaTaskToOperationalListTask(
  t: {
    id: string;
    title: string;
    description: string | null;
    plannedStartDate: Date | null;
    plannedEndDate: Date | null;
    assigneeName: string | null;
    status: string;
    isDone: boolean;
    doneAt: Date | null;
    priority: string | null;
    createdAt: Date;
    updatedAt: Date;
    projectId: string;
    project: { name: string };
  },
  extra?: { daysOverdue: number },
): OperationalListTask {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    plannedStartDate: t.plannedStartDate?.toISOString() ?? null,
    plannedEndDate: t.plannedEndDate?.toISOString() ?? null,
    assigneeName: t.assigneeName,
    status: t.status,
    isDone: t.isDone,
    doneAt: t.doneAt?.toISOString() ?? null,
    priority: t.priority,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    projectId: t.projectId,
    projectName: t.project.name,
    ...(extra ? { daysOverdue: extra.daysOverdue } : {}),
  };
}

export async function loadOperationalDashboardData(): Promise<{
  overdueTasks: OperationalListTask[];
  overdueTasksTotalCount: number;
  todayTasks: OperationalListTask[];
  attentionProjects: OperationalAttentionProject[];
  staleProjects: OperationalStaleProject[];
}> {
  const now = new Date();
  const startToday = startOfDay(now);
  const endToday = endOfDay(now);
  const todayMs = startToday.getTime();

  const [
    overdueTasksTop,
    overdueTasksTotalCount,
    todayTaskCandidates,
    projectsBase,
    overdueTaskCounts,
    missingCounts,
    taskActivity,
    incomeDirect,
    incomeAlloc,
    costDirect,
    costAlloc,
    plannedDirect,
    plannedAlloc,
    otherIncomeActivity,
    lifeOpts,
    setOpts,
  ] = await Promise.all([
    prisma.projectTask.findMany({
      where: {
        isDone: false,
        plannedEndDate: { lt: startToday },
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: [{ plannedEndDate: "asc" }, { title: "asc" }],
      take: OVERDUE_TASK_LIST_LIMIT,
    }),
    prisma.projectTask.count({
      where: { isDone: false, plannedEndDate: { lt: startToday } },
    }),
    prisma.projectTask.findMany({
      where: {
        isDone: false,
        OR: [
          { plannedStartDate: { gte: startToday, lte: endToday } },
          { plannedEndDate: { gte: startToday, lte: endToday } },
        ],
      },
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        lifecycleStatus: true,
        settlementStatus: true,
        updatedAt: true,
      },
    }),
    prisma.projectTask.groupBy({
      by: ["projectId"],
      where: {
        isDone: false,
        plannedEndDate: { lt: startToday },
      },
      _count: { _all: true },
    }),
    prisma.projectMissingItem.groupBy({
      by: ["projectId"],
      _count: { _all: true },
    }),
    prisma.projectTask.groupBy({
      by: ["projectId"],
      _max: { updatedAt: true, createdAt: true },
    }),
    prisma.incomeInvoice.groupBy({
      by: ["projectId"],
      where: { projectId: { not: null } },
      _max: { updatedAt: true, createdAt: true },
    }),
    prisma.incomeInvoiceProjectAllocation.groupBy({
      by: ["projectId"],
      _max: { updatedAt: true, createdAt: true },
    }),
    prisma.costInvoice.groupBy({
      by: ["projectId"],
      where: { projectId: { not: null } },
      _max: { updatedAt: true, createdAt: true },
    }),
    prisma.costInvoiceProjectAllocation.groupBy({
      by: ["projectId"],
      _max: { updatedAt: true, createdAt: true },
    }),
    prisma.plannedFinancialEvent.groupBy({
      by: ["projectId"],
      where: { projectId: { not: null } },
      _max: { updatedAt: true, createdAt: true },
    }),
    prisma.plannedEventProjectAllocation.groupBy({
      by: ["projectId"],
      _max: { updatedAt: true, createdAt: true },
    }),
    prisma.otherIncome.groupBy({
      by: ["projectId"],
      where: { projectId: { not: null } },
      _max: { createdAt: true },
    }),
    prisma.projectLifecycleStatusOption.findMany({ select: { slug: true, name: true } }),
    prisma.projectSettlementStatusOption.findMany({ select: { slug: true, name: true } }),
  ]);

  const lifeMap = new Map(lifeOpts.map((o) => [o.slug, o.name]));
  const setMap = new Map(setOpts.map((o) => [o.slug, o.name]));

  const overdueTasks: OperationalListTask[] = overdueTasksTop.map((t) => {
    const endMs = t.plannedEndDate ? plannedDayStartMs(t.plannedEndDate.toISOString()) ?? todayMs : todayMs;
    const daysOverdue = Math.max(0, Math.floor((todayMs - endMs) / 86_400_000));
    return prismaTaskToOperationalListTask(t, { daysOverdue });
  });

  const todayTasks: OperationalListTask[] = todayTaskCandidates
    .filter((t) => isTaskTodayFromDb(t))
    .sort((a, b) => prioritySort(a.priority, b.priority) || a.title.localeCompare(b.title, "pl"))
    .map((t) => prismaTaskToOperationalListTask(t));

  const overdueMap = new Map(overdueTaskCounts.map((x) => [x.projectId, x._count._all]));
  const missingMap = new Map(missingCounts.map((x) => [x.projectId, x._count._all]));

  const attentionProjects: OperationalAttentionProject[] = projectsBase
    .filter((p) => {
      const lifecycleAttn = isLifecycleAttentionSlug(p.lifecycleStatus);
      const settlementAttn = isSettlementAttentionSlug(p.settlementStatus);
      const missing = missingMap.get(p.id) ?? 0;
      const overdue = overdueMap.get(p.id) ?? 0;
      return lifecycleAttn || settlementAttn || missing > 0 || overdue > 0;
    })
    .map((p) => ({
      id: p.id,
      name: p.name,
      lifecycleStatus: p.lifecycleStatus,
      settlementStatus: p.settlementStatus,
      lifecycleLabel: dictLabel(lifeMap, p.lifecycleStatus),
      settlementLabel: dictLabel(setMap, p.settlementStatus),
      overdueTaskCount: overdueMap.get(p.id) ?? 0,
      activeMissingCount: missingMap.get(p.id) ?? 0,
    }))
    .sort((a, b) => {
      const s = b.overdueTaskCount - a.overdueTaskCount;
      if (s !== 0) return s;
      const m = b.activeMissingCount - a.activeMissingCount;
      if (m !== 0) return m;
      return a.name.localeCompare(b.name, "pl");
    })
    .slice(0, ATTENTION_PROJECTS_LIMIT);

  const lastByProject: Record<string, number> = {};
  for (const p of projectsBase) {
    bumpLastActivity(lastByProject, p.id, p.updatedAt.getTime());
  }
  for (const g of taskActivity) {
    const ms = Math.max(maxTime(g._max.updatedAt), maxTime(g._max.createdAt));
    bumpLastActivity(lastByProject, g.projectId, ms);
  }
  for (const g of incomeDirect) {
    const ms = Math.max(maxTime(g._max.updatedAt), maxTime(g._max.createdAt));
    bumpLastActivity(lastByProject, g.projectId, ms);
  }
  for (const g of incomeAlloc) {
    const ms = Math.max(maxTime(g._max.updatedAt), maxTime(g._max.createdAt));
    bumpLastActivity(lastByProject, g.projectId, ms);
  }
  for (const g of costDirect) {
    const ms = Math.max(maxTime(g._max.updatedAt), maxTime(g._max.createdAt));
    bumpLastActivity(lastByProject, g.projectId, ms);
  }
  for (const g of costAlloc) {
    const ms = Math.max(maxTime(g._max.updatedAt), maxTime(g._max.createdAt));
    bumpLastActivity(lastByProject, g.projectId, ms);
  }
  for (const g of plannedDirect) {
    const ms = Math.max(maxTime(g._max.updatedAt), maxTime(g._max.createdAt));
    bumpLastActivity(lastByProject, g.projectId, ms);
  }
  for (const g of plannedAlloc) {
    const ms = Math.max(maxTime(g._max.updatedAt), maxTime(g._max.createdAt));
    bumpLastActivity(lastByProject, g.projectId, ms);
  }
  for (const g of otherIncomeActivity) {
    const ms = maxTime(g._max.createdAt);
    bumpLastActivity(lastByProject, g.projectId, ms);
  }

  const staleCutoffMs = todayMs - STALE_ACTIVITY_DAYS * 86_400_000;

  const staleProjects: OperationalStaleProject[] = projectsBase
    .filter((p) => p.lifecycleStatus !== "COMPLETED")
    .map((p) => {
      const last = lastByProject[p.id] ?? p.updatedAt.getTime();
      return { project: p, last };
    })
    .filter(({ last }) => last < staleCutoffMs)
    .sort((a, b) => a.last - b.last)
    .slice(0, STALE_PROJECT_LIST_LIMIT)
    .map(({ project: p, last }) => ({
      id: p.id,
      name: p.name,
      lifecycleStatus: p.lifecycleStatus,
      settlementStatus: p.settlementStatus,
      lifecycleLabel: dictLabel(lifeMap, p.lifecycleStatus),
      settlementLabel: dictLabel(setMap, p.settlementStatus),
      lastActivityAt: new Date(last).toISOString(),
    }));

  return {
    overdueTasks,
    overdueTasksTotalCount,
    todayTasks,
    attentionProjects,
    staleProjects,
  };
}
