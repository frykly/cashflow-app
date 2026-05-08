import { prisma } from "@/lib/db";
import { buildMonthGrid, dayStartMs } from "@/lib/calendar/month-grid";
import { spanOverlapsRange, taskCalendarSpanMs } from "@/lib/calendar/task-span";

export type CalendarTaskTile = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  assigneeName: string | null;
  priority: string | null;
  status: string;
  isDone: boolean;
};

export type CalendarDayCell = {
  dayKey: string;
  inMonth: boolean;
  date: Date;
  tasks: CalendarTaskTile[];
};

export type CalendarWeekRow = CalendarDayCell[];

export async function loadCalendarMonthData(
  year: number,
  month: number,
  options: { assignee?: string; hideDone: boolean },
): Promise<{ monthLabel: string; weekRows: CalendarWeekRow[] }> {
  const { cells, weekRows: cellWeeks } = buildMonthGrid(year, month);
  const gridStart = cells[0]!.date;
  const gridEnd = cells[cells.length - 1]!.date;
  const rangeStartMs = dayStartMs(gridStart);
  const rangeEndMs = dayStartMs(gridEnd);

  const assigneeQ = options.assignee?.trim().toLowerCase() ?? "";

  const raw = await prisma.projectTask.findMany({
    where: {
      OR: [{ plannedStartDate: { not: null } }, { plannedEndDate: { not: null } }],
      ...(options.hideDone ? { isDone: false } : {}),
    },
    include: { project: { select: { id: true, name: true } } },
    orderBy: [{ isDone: "asc" }, { plannedEndDate: "asc" }, { plannedStartDate: "asc" }, { title: "asc" }],
  });

  const byId = new Map(raw.map((r) => [r.id, r]));

  const tiles: CalendarTaskTile[] = [];
  for (const row of raw) {
    const span = taskCalendarSpanMs(row.plannedStartDate, row.plannedEndDate);
    if (!span || !spanOverlapsRange(span, rangeStartMs, rangeEndMs)) continue;
    if (assigneeQ && !(row.assigneeName ?? "").toLowerCase().includes(assigneeQ)) continue;
    tiles.push({
      id: row.id,
      projectId: row.projectId,
      projectName: row.project.name,
      title: row.title,
      assigneeName: row.assigneeName,
      priority: row.priority,
      status: row.status,
      isDone: row.isDone,
    });
  }

  const tasksByDayKey = new Map<string, CalendarTaskTile[]>();
  for (const c of cells) {
    tasksByDayKey.set(c.dayKey, []);
  }

  for (const task of tiles) {
    const row = byId.get(task.id);
    if (!row) continue;
    const span = taskCalendarSpanMs(row.plannedStartDate, row.plannedEndDate);
    if (!span) continue;
    for (const c of cells) {
      const d = dayStartMs(c.date);
      if (d >= span.startMs && d <= span.endMs) {
        const list = tasksByDayKey.get(c.dayKey)!;
        if (!list.some((t) => t.id === task.id)) list.push(task);
      }
    }
  }

  const monthLabel = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );

  const weekRows: CalendarWeekRow[] = cellWeeks.map((week) =>
    week.map((c) => ({
      dayKey: c.dayKey,
      inMonth: c.inMonth,
      date: c.date,
      tasks: tasksByDayKey.get(c.dayKey) ?? [],
    })),
  );

  return { monthLabel, weekRows };
}
