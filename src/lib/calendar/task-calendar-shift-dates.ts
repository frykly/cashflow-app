import { dateInputToIso, isoToDateInputValue } from "@/lib/date-input";
import { dayKeyFromDate, dayStartMs } from "@/lib/calendar/month-grid";
import type { CalendarTaskTile } from "@/lib/calendar/load-calendar-data";
import { taskCalendarSpanMs } from "@/lib/calendar/task-span";

/** Pola wysyłane w PATCH — tylko te, które mają się zmienić (bez zerowania drugiej daty). */
export type TaskPlannedDatePatch = Partial<{
  plannedStartDate: string | null;
  plannedEndDate: string | null;
}>;

function dayKeyToLocalMs(dayKey: string): number {
  const parts = dayKey.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return Number.NaN;
  const [y, m, d] = parts;
  return dayStartMs(new Date(y, m - 1, d));
}

function localMsToApiIso(ms: number): string | null {
  if (Number.isNaN(ms)) return null;
  const dk = dayKeyFromDate(new Date(ms));
  return dateInputToIso(dk);
}

export function isNoOpDatePatch(patch: TaskPlannedDatePatch, tile: CalendarTaskTile): boolean {
  if (patch.plannedStartDate !== undefined) {
    const a = isoToDateInputValue(patch.plannedStartDate);
    const b = isoToDateInputValue(tile.plannedStartDate);
    if (a !== b) return false;
  }
  if (patch.plannedEndDate !== undefined) {
    const a = isoToDateInputValue(patch.plannedEndDate);
    const b = isoToDateInputValue(tile.plannedEndDate);
    if (a !== b) return false;
  }
  return true;
}

/**
 * Przesuwa plan zadania tak, by „kotwica” wskazywała targetDayKey (YYYY-MM-DD).
 * Używa oryginalnych plannedStartDate / plannedEndDate z kafelka (nie segmentu tygodnia).
 */
export function shiftTaskPlannedDatesToDay(tile: CalendarTaskTile, targetDayKey: string): TaskPlannedDatePatch | null {
  const sKey = tile.plannedStartDate ? isoToDateInputValue(tile.plannedStartDate) : "";
  const eKey = tile.plannedEndDate ? isoToDateInputValue(tile.plannedEndDate) : "";
  const s = sKey || null;
  const e = eKey || null;

  if (!s && !e) return null;

  const targetIso = dateInputToIso(targetDayKey);
  if (!targetIso) return null;

  if (s && e && s === e) {
    return { plannedStartDate: targetIso, plannedEndDate: targetIso };
  }
  if (!s && e) {
    return { plannedEndDate: targetIso };
  }
  if (s && !e) {
    return { plannedStartDate: targetIso };
  }

  const startMs = dayKeyToLocalMs(s!);
  const endMs = dayKeyToLocalMs(e!);
  const targetMs = dayKeyToLocalMs(targetDayKey);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || Number.isNaN(targetMs)) return null;

  const delta = targetMs - startMs;
  const newStartMs = targetMs;
  const newEndMs = endMs + delta;

  return {
    plannedStartDate: localMsToApiIso(newStartMs),
    plannedEndDate: localMsToApiIso(newEndMs),
  };
}

function inclusiveDayKeysBetween(aKey: string, bKey: string): string[] {
  const lo = aKey <= bKey ? aKey : bKey;
  const hi = aKey <= bKey ? bKey : aKey;
  const [y0, m0, d0] = lo.split("-").map(Number);
  const [y1, m1, d1] = hi.split("-").map(Number);
  if ([y0, m0, d0, y1, m1, d1].some((n) => Number.isNaN(n))) return [];
  const endMs = new Date(y1, m1 - 1, d1).getTime();
  const out: string[] = [];
  const cur = new Date(y0, m0 - 1, d0);
  while (cur.getTime() <= endMs) {
    out.push(dayKeyFromDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/**
 * Skrócenie / wydłużenie zakresu: zmiana jednej krawędzi do wskazanego dnia (clamp w obrębie drugiej krawędzi).
 */
export function resizeTaskPlannedEdge(
  tile: CalendarTaskTile,
  edge: "start" | "end",
  targetDayKey: string,
): TaskPlannedDatePatch | null {
  const span = taskCalendarSpanMs(
    tile.plannedStartDate ? new Date(tile.plannedStartDate) : null,
    tile.plannedEndDate ? new Date(tile.plannedEndDate) : null,
  );
  if (!span || span.startMs >= span.endMs) return null;

  let targetMs = dayKeyToLocalMs(targetDayKey);
  if (Number.isNaN(targetMs)) return null;

  if (edge === "start") {
    if (targetMs > span.endMs) targetMs = span.endMs;
    return { plannedStartDate: localMsToApiIso(targetMs) };
  }
  if (targetMs < span.startMs) targetMs = span.startMs;
  return { plannedEndDate: localMsToApiIso(targetMs) };
}

/** Dni do podświetlenia podczas przeciągania uchwytu (granica stara ↔ podglądowa). */
export function calendarResizePreviewDayKeys(
  tile: CalendarTaskTile,
  edge: "start" | "end",
  hoverDayKey: string | null,
): string[] {
  if (!hoverDayKey) return [];
  const span = taskCalendarSpanMs(
    tile.plannedStartDate ? new Date(tile.plannedStartDate) : null,
    tile.plannedEndDate ? new Date(tile.plannedEndDate) : null,
  );
  if (!span || span.startMs >= span.endMs) return [];

  let hoverMs = dayKeyToLocalMs(hoverDayKey);
  if (Number.isNaN(hoverMs)) return [];

  if (edge === "start") {
    if (hoverMs > span.endMs) hoverMs = span.endMs;
    const oldKey = isoToDateInputValue(tile.plannedStartDate);
    if (!oldKey) return [];
    const newKey = dayKeyFromDate(new Date(hoverMs));
    return inclusiveDayKeysBetween(oldKey, newKey);
  }

  if (hoverMs < span.startMs) hoverMs = span.startMs;
  const oldKey = isoToDateInputValue(tile.plannedEndDate);
  if (!oldKey) return [];
  const newKey = dayKeyFromDate(new Date(hoverMs));
  return inclusiveDayKeysBetween(oldKey, newKey);
}
