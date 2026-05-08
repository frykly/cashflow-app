import { prisma } from "@/lib/db";
import type { ProjectTaskRow } from "@/lib/projects/project-task-ui";
import { buildMonthGrid, dayStartMs } from "@/lib/calendar/month-grid";
import { spanOverlapsRange, taskCalendarSpanMs } from "@/lib/calendar/task-span";

export type CalendarTaskTile = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string | null;
  assigneeName: string | null;
  priority: string | null;
  status: string;
  isDone: boolean;
  doneAt: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarDayHeader = {
  dayKey: string;
  inMonth: boolean;
  date: Date;
};

export type CalendarWeekBlock = {
  days: CalendarDayHeader[];
};

export type CalendarWeekBlockJSON = {
  days: { dayKey: string; inMonth: boolean; dateIso: string }[];
};

export function calendarTileToProjectTaskRow(t: CalendarTaskTile): ProjectTaskRow {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    plannedStartDate: t.plannedStartDate,
    plannedEndDate: t.plannedEndDate,
    assigneeName: t.assigneeName,
    status: t.status,
    isDone: t.isDone,
    doneAt: t.doneAt,
    priority: t.priority,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

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
      description: row.description,
      assigneeName: row.assigneeName,
      priority: row.priority,
      status: row.status,
      isDone: row.isDone,
      doneAt: row.doneAt ? row.doneAt.toISOString() : null,
      plannedStartDate: row.plannedStartDate ? row.plannedStartDate.toISOString() : null,
      plannedEndDate: row.plannedEndDate ? row.plannedEndDate.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
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
