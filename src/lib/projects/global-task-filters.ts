import { plannedDayStartMs, isTaskOverdue, isTaskToday, type ProjectTaskRow } from "@/lib/projects/project-task-ui";

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

/** Sortowanie listy /tasks — domyślnie: aktywne = termin→start; wykonane = data wykonania. */
export type GlobalTaskSort = "deadline" | "start" | "created_new" | "created_old" | "done_new";

const SORTS = new Set<GlobalTaskSort>(["deadline", "start", "created_new", "created_old", "done_new"]);

export function defaultSortForView(view: GlobalTaskView): GlobalTaskSort {
  return view === "done" ? "done_new" : "deadline";
}

export function parseGlobalTaskSort(raw: string | string[] | undefined, view: GlobalTaskView): GlobalTaskSort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && SORTS.has(v as GlobalTaskSort)) {
    const s = v as GlobalTaskSort;
    if (view !== "done" && s === "done_new") return "deadline";
    return s;
  }
  return defaultSortForView(view);
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

export function filterGlobalTasks(tasks: GlobalProjectTaskRow[], view: GlobalTaskView, options?: { assignee?: string }): GlobalProjectTaskRow[] {
  const assigneeQ = options?.assignee?.trim() ?? "";

  return tasks.filter((t) => {
    if (!matchesAssigneeFilter(t, assigneeQ)) return false;

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

function daySortKey(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const p = plannedDayStartMs(iso);
  return p === null ? Number.MAX_SAFE_INTEGER : p;
}

function compareDeadlineThenStart(a: GlobalProjectTaskRow, b: GlobalProjectTaskRow): number {
  const e = daySortKey(a.plannedEndDate) - daySortKey(b.plannedEndDate);
  if (e !== 0) return e;
  const s = daySortKey(a.plannedStartDate) - daySortKey(b.plannedStartDate);
  if (s !== 0) return s;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function compareStartThenDeadline(a: GlobalProjectTaskRow, b: GlobalProjectTaskRow): number {
  const s = daySortKey(a.plannedStartDate) - daySortKey(b.plannedStartDate);
  if (s !== 0) return s;
  const e = daySortKey(a.plannedEndDate) - daySortKey(b.plannedEndDate);
  if (e !== 0) return e;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function compareDoneNew(a: GlobalProjectTaskRow, b: GlobalProjectTaskRow): number {
  const ta = a.doneAt ? new Date(a.doneAt).getTime() : 0;
  const tb = b.doneAt ? new Date(b.doneAt).getTime() : 0;
  if (tb !== ta) return tb - ta;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function sortGlobalTaskList(tasks: GlobalProjectTaskRow[], sort: GlobalTaskSort): GlobalProjectTaskRow[] {
  const list = [...tasks];
  switch (sort) {
    case "deadline":
      list.sort(compareDeadlineThenStart);
      break;
    case "start":
      list.sort(compareStartThenDeadline);
      break;
    case "created_new":
      list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.id.localeCompare(b.id),
      );
      break;
    case "created_old":
      list.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id),
      );
      break;
    case "done_new":
      list.sort(compareDoneNew);
      break;
    default:
      list.sort(compareDeadlineThenStart);
  }
  return list;
}

export type GlobalTaskTabCounts = {
  active: number;
  overdue: number;
  today: number;
  week: number;
  done: number;
};

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
