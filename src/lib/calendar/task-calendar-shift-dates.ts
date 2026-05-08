import { dateInputToIso, isoToDateInputValue } from "@/lib/date-input";
import { dayKeyFromDate, dayStartMs } from "@/lib/calendar/month-grid";
import type { CalendarTaskTile } from "@/lib/calendar/load-calendar-data";

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
