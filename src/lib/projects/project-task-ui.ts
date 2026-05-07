import { formatDate } from "@/lib/format";

export const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: "Do zrobienia",
  IN_PROGRESS: "W trakcie",
  DONE: "Wykonane",
};

export const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Niski",
  NORMAL: "Normalny",
  HIGH: "Wysoki",
};

export type ProjectTaskRow = {
  id: string;
  title: string;
  description: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  assigneeName: string | null;
  status: string;
  isDone: boolean;
  doneAt: string | null;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
};

export function statusBadgeVariant(s: string, isDone: boolean): "default" | "success" | "muted" {
  if (isDone || s === "DONE") return "success";
  if (s === "IN_PROGRESS") return "default";
  return "muted";
}

export function priorityBadgeVariant(p: string | null | undefined): "default" | "warning" | "muted" | "danger" {
  if (p === "HIGH") return "danger";
  if (p === "NORMAL") return "default";
  if (p === "LOW") return "muted";
  return "default";
}

export function localDayStartMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function plannedDayStartMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return localDayStartMs(d);
}

export function todayStartMs(): number {
  return localDayStartMs(new Date());
}

function sameLocalDayIso(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = plannedDayStartMs(a);
  const db = plannedDayStartMs(b);
  return da !== null && db !== null && da === db;
}

export function scheduleLabel(t: ProjectTaskRow): string {
  const s = t.plannedStartDate;
  const e = t.plannedEndDate;
  if (s && e && sameLocalDayIso(s, e)) return formatDate(s);
  if (s && e) return `${formatDate(s)} → ${formatDate(e)}`;
  if (e) return `Termin: ${formatDate(e)}`;
  if (s) return `Start: ${formatDate(s)}`;
  return "Bez terminu";
}

function dayKeyFromIso(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const p = plannedDayStartMs(iso);
  return p === null ? Number.MAX_SAFE_INTEGER : p;
}

export function isTaskOverdue(t: ProjectTaskRow): boolean {
  if (t.isDone || !t.plannedEndDate) return false;
  const p = plannedDayStartMs(t.plannedEndDate);
  if (p === null) return false;
  return p < todayStartMs();
}

export function isTaskToday(t: ProjectTaskRow): boolean {
  if (t.isDone) return false;
  const t0 = todayStartMs();
  for (const iso of [t.plannedStartDate, t.plannedEndDate]) {
    if (!iso) continue;
    const p = plannedDayStartMs(iso);
    if (p !== null && p === t0) return true;
  }
  return false;
}

export function sortActiveTasks(a: ProjectTaskRow, b: ProjectTaskRow): number {
  const s = dayKeyFromIso(a.plannedStartDate) - dayKeyFromIso(b.plannedStartDate);
  if (s !== 0) return s;
  const e = dayKeyFromIso(a.plannedEndDate) - dayKeyFromIso(b.plannedEndDate);
  if (e !== 0) return e;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

export function sortDoneTasks(a: ProjectTaskRow, b: ProjectTaskRow): number {
  const ta = a.doneAt ? new Date(a.doneAt).getTime() : 0;
  const tb = b.doneAt ? new Date(b.doneAt).getTime() : 0;
  if (tb !== ta) return tb - ta;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
