import { dayStartMs } from "@/lib/calendar/month-grid";

export function taskCalendarSpanMs(plannedStartDate: Date | null, plannedEndDate: Date | null): { startMs: number; endMs: number } | null {
  const s = plannedStartDate ? dayStartMs(plannedStartDate) : null;
  const e = plannedEndDate ? dayStartMs(plannedEndDate) : null;
  if (s === null && e === null) return null;
  if (s !== null && e !== null) return { startMs: Math.min(s, e), endMs: Math.max(s, e) };
  if (s !== null) return { startMs: s, endMs: s };
  return { startMs: e!, endMs: e! };
}

export function spanOverlapsRange(span: { startMs: number; endMs: number }, rangeStartMs: number, rangeEndMs: number): boolean {
  return span.startMs <= rangeEndMs && span.endMs >= rangeStartMs;
}
