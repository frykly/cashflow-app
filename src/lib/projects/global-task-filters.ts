import { plannedDayStartMs, isTaskOverdue, isTaskToday, type ProjectTaskRow, sortActiveTasks, sortDoneTasks } from "@/lib/projects/project-task-ui";

export type GlobalProjectTaskRow = ProjectTaskRow & {
  projectId: string;
  projectName: string;
};

export type GlobalTaskView = "active" | "overdue" | "today" | "week" | "done";

const VIEWS = new Set<GlobalTaskView>(["active", "overdue", "today", "week", "done"]);

export function parseGlobalTaskView(raw: string | string[] | undefined): GlobalTaskView {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && VIEWS.has(v as GlobalTaskView)) return v as GlobalTaskView;
  return "active";
}

function currentWeekBoundsMs(): { start: number; end: number } {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday.getTime(), end: sunday.getTime() };
}

/** Czy dzień kalendarzowy daty ISO zawiera się w przedziale [start, end] (początki dni). */
function dayInWeek(iso: string | null | undefined, start: number, end: number): boolean {
  const p = plannedDayStartMs(iso);
  return p !== null && p >= start && p <= end;
}

export function isTaskInCurrentWeek(t: GlobalProjectTaskRow): boolean {
  if (t.isDone) return false;
  const { start, end } = currentWeekBoundsMs();
  return dayInWeek(t.plannedStartDate, start, end) || dayInWeek(t.plannedEndDate, start, end);
}

export function matchesAssigneeFilter(t: GlobalProjectTaskRow, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const name = (t.assigneeName ?? "").toLowerCase();
  return name.includes(s);
}

export type StatusFilter = "TODO" | "IN_PROGRESS" | "DONE" | "";

export function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "TODO" || v === "IN_PROGRESS" || v === "DONE") return v;
  return "";
}

export function matchesStatusFilter(t: GlobalProjectTaskRow, status: StatusFilter): boolean {
  if (!status) return true;
  return t.status === status;
}

export function filterGlobalTasks(
  tasks: GlobalProjectTaskRow[],
  view: GlobalTaskView,
  options?: { assignee?: string; status?: StatusFilter },
): GlobalProjectTaskRow[] {
  const assigneeQ = options?.assignee?.trim() ?? "";
  const status = options?.status ?? "";

  return tasks.filter((t) => {
    if (!matchesAssigneeFilter(t, assigneeQ)) return false;
    if (!matchesStatusFilter(t, status)) return false;

    switch (view) {
      case "active":
        return !t.isDone;
      case "overdue":
        return !t.isDone && isTaskOverdue(t);
      case "today":
        return !t.isDone && isTaskToday(t);
      case "week":
        return !t.isDone && isTaskInCurrentWeek(t);
      case "done":
        return t.isDone;
      default:
        return !t.isDone;
    }
  });
}

export type GlobalTaskTabCounts = {
  active: number;
  overdue: number;
  today: number;
  week: number;
  done: number;
};

export function sortTasksForGlobalView(tasks: GlobalProjectTaskRow[], view: GlobalTaskView): GlobalProjectTaskRow[] {
  const list = [...tasks];
  if (view === "done") list.sort(sortDoneTasks);
  else list.sort(sortActiveTasks);
  return list;
}

export function computeGlobalTaskTabCounts(tasks: GlobalProjectTaskRow[]): GlobalTaskTabCounts {
  const active = tasks.filter((t) => !t.isDone);
  return {
    active: active.length,
    overdue: active.filter((t) => isTaskOverdue(t)).length,
    today: active.filter((t) => isTaskToday(t)).length,
    week: active.filter((t) => isTaskInCurrentWeek(t)).length,
    done: tasks.filter((t) => t.isDone).length,
  };
}
