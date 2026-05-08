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
  plannedStartDate: string | null;
  plannedEndDate: string | null;
};

export type CalendarDayHeader = {
  dayKey: string;
  inMonth: boolean;
  date: Date;
};

export type CalendarWeekBlock = {
  days: CalendarDayHeader[];
};

export async function loadCalendarMonthData(
  year: number,
  month: number,
  options: { assignee?: string; hideDone: boolean },
): Promise<{ monthLabel: string; weeks: CalendarWeekBlock[]; tiles: CalendarTaskTile[] }> {
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
      plannedStartDate: row.plannedStartDate ? row.plannedStartDate.toISOString() : null,
      plannedEndDate: row.plannedEndDate ? row.plannedEndDate.toISOString() : null,
    });
  }

  const monthLabel = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" }).format(
    new Date(year, month - 1, 1),
  );

  const weeks: CalendarWeekBlock[] = cellWeeks.map((week) => ({
    days: week.map((c) => ({
      dayKey: c.dayKey,
      inMonth: c.inMonth,
      date: c.date,
    })),
  }));

  return { monthLabel, weeks, tiles };
}
