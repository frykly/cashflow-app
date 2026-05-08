import type { CalendarTaskTile, CalendarDayHeader } from "@/lib/calendar/load-calendar-data";
import { dayKeyFromDate, dayStartMs } from "@/lib/calendar/month-grid";
import { spanOverlapsRange, taskCalendarSpanMs } from "@/lib/calendar/task-span";

const MAX_MULTI_TRACKS = 3;
const MAX_SINGLE_VISIBLE = 3;

export type WeekMultiSegment = {
  task: CalendarTaskTile;
  startCol: number;
  endCol: number;
  track: number;
};

export type WeekLayout = {
  multiSegments: WeekMultiSegment[];
  overflowMulti: CalendarTaskTile[];
  singleByDay: Map<string, { visible: CalendarTaskTile[]; rest: CalendarTaskTile[] }>;
};

export function tileSpanMs(tile: CalendarTaskTile): { startMs: number; endMs: number } | null {
  const sd = tile.plannedStartDate ? new Date(tile.plannedStartDate) : null;
  const ed = tile.plannedEndDate ? new Date(tile.plannedEndDate) : null;
  return taskCalendarSpanMs(sd, ed);
}

export function isMultiDayTile(tile: CalendarTaskTile): boolean {
  const span = tileSpanMs(tile);
  if (!span) return false;
  return span.startMs < span.endMs;
}

function colForDayStartMs(days: CalendarDayHeader[], ms: number): number {
  for (let i = 0; i < days.length; i++) {
    if (dayStartMs(days[i]!.date) === ms) return i;
  }
  return -1;
}

function segmentsOverlap(a: { startCol: number; endCol: number }, b: { startCol: number; endCol: number }): boolean {
  return a.startCol <= b.endCol && a.endCol >= b.startCol;
}

function sortSingles(tasks: CalendarTaskTile[]): CalendarTaskTile[] {
  return [...tasks].sort((a, b) => {
    const ah = a.priority === "HIGH" ? 0 : 1;
    const bh = b.priority === "HIGH" ? 0 : 1;
    if (ah !== bh) return ah - bh;
    return a.title.localeCompare(b.title, "pl");
  });
}

/**
 * Układ jednego tygodnia: paski wielodniowe (segmenty przycięte do tygodnia, segmenty tygodniowe przy przejściu miesiąca)
 * oraz zadania jednodniowe per komórka.
 */
export function layoutWeek(days: CalendarDayHeader[], tiles: CalendarTaskTile[]): WeekLayout {
  const weekStartMs = dayStartMs(days[0]!.date);
  const weekEndMs = dayStartMs(days[6]!.date);
  const dayKeySet = new Set(days.map((d) => d.dayKey));

  const multiRaw: { task: CalendarTaskTile; startCol: number; endCol: number }[] = [];
  const singleByDay = new Map<string, CalendarTaskTile[]>();
  for (const d of days) singleByDay.set(d.dayKey, []);

  for (const task of tiles) {
    const span = tileSpanMs(task);
    if (!span || !spanOverlapsRange(span, weekStartMs, weekEndMs)) continue;

    if (span.startMs < span.endMs) {
      const clampedStart = Math.max(span.startMs, weekStartMs);
      const clampedEnd = Math.min(span.endMs, weekEndMs);
      const startCol = colForDayStartMs(days, clampedStart);
      const endCol = colForDayStartMs(days, clampedEnd);
      if (startCol < 0 || endCol < 0) continue;
      multiRaw.push({ task, startCol, endCol });
    } else {
      const dk = dayKeyFromDate(new Date(span.startMs));
      if (dayKeySet.has(dk)) singleByDay.get(dk)!.push(task);
    }
  }

  multiRaw.sort((a, b) => {
    const ah = a.task.priority === "HIGH" ? 0 : 1;
    const bh = b.task.priority === "HIGH" ? 0 : 1;
    if (ah !== bh) return ah - bh;
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    return (b.endCol - b.startCol) - (a.endCol - a.startCol);
  });

  const placed: WeekMultiSegment[] = [];
  for (const seg of multiRaw) {
    let track = 0;
    while (placed.some((p) => p.track === track && segmentsOverlap(p, seg))) track++;
    placed.push({ task: seg.task, startCol: seg.startCol, endCol: seg.endCol, track });
  }

  const multiSegments: WeekMultiSegment[] = [];
  const overflowMulti: CalendarTaskTile[] = [];
  for (const p of placed) {
    if (p.track < MAX_MULTI_TRACKS) multiSegments.push(p);
    else overflowMulti.push(p.task);
  }

  const overflowUnique = [...new Map(overflowMulti.map((t) => [t.id, t])).values()];

  const singlePacked = new Map<string, { visible: CalendarTaskTile[]; rest: CalendarTaskTile[] }>();
  for (const d of days) {
    const sorted = sortSingles(singleByDay.get(d.dayKey) ?? []);
    singlePacked.set(d.dayKey, {
      visible: sorted.slice(0, MAX_SINGLE_VISIBLE),
      rest: sorted.slice(MAX_SINGLE_VISIBLE),
    });
  }

  return { multiSegments, overflowMulti: overflowUnique, singleByDay: singlePacked };
}
