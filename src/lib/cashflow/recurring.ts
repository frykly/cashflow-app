import type { RecurringTemplate } from "@prisma/client";
import { addDays, addMonths, addYears, endOfDay, getDate, getDay, isAfter, isBefore, startOfDay } from "date-fns";

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function clampDayInMonth(y: number, m: number, day: number): number {
  return Math.min(day, daysInMonth(y, m));
}

/** Daty wystąpień powtarzalnego zdarzenia w [rangeStart, rangeEnd]. */
export function occurrenceDatesInRange(
  tmpl: Pick<
    RecurringTemplate,
    "frequency" | "startDate" | "endDate" | "dayOfMonth" | "weekday"
  >,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const rs = startOfDay(rangeStart);
  const re = startOfDay(rangeEnd);
  const tEnd = tmpl.endDate ? endOfDay(tmpl.endDate) : null;

  const seq = enumerateOccurrences(tmpl);
  const out: Date[] = [];
  for (const d of seq) {
    const ds = startOfDay(d);
    if (isBefore(ds, rs)) continue;
    if (isAfter(ds, re)) break;
    if (tEnd && isAfter(ds, tEnd)) break;
    out.push(ds);
  }
  return out;
}

function* enumerateOccurrences(
  tmpl: Pick<RecurringTemplate, "frequency" | "startDate" | "dayOfMonth" | "weekday">,
): Generator<Date> {
  const t0 = startOfDay(tmpl.startDate);
  switch (tmpl.frequency) {
    case "WEEKLY": {
      const wd = tmpl.weekday ?? getDay(t0);
      let d = new Date(t0);
      if (getDay(d) !== wd) {
        let guard = 0;
        while (getDay(d) !== wd && guard++ < 8) d = addDays(d, 1);
      }
      for (let i = 0; i < 520; i++) {
        yield new Date(d);
        d = addDays(d, 7);
      }
      break;
    }
    case "MONTHLY": {
      const dom = tmpl.dayOfMonth ?? getDate(t0);
      for (let k = 0; k < 240; k++) {
        const base = addMonths(t0, k);
        const y = base.getFullYear();
        const m = base.getMonth();
        const day = clampDayInMonth(y, m, dom);
        yield new Date(y, m, day);
      }
      break;
    }
    case "QUARTERLY": {
      const dom = tmpl.dayOfMonth ?? getDate(t0);
      for (let k = 0; k < 80; k++) {
        const base = addMonths(t0, k * 3);
        const y = base.getFullYear();
        const m = base.getMonth();
        const day = clampDayInMonth(y, m, dom);
        yield new Date(y, m, day);
      }
      break;
    }
    case "YEARLY": {
      const dom = tmpl.dayOfMonth ?? getDate(t0);
      const month = t0.getMonth();
      for (let k = 0; k < 40; k++) {
        const base = addYears(t0, k);
        const y = base.getFullYear();
        const day = clampDayInMonth(y, month, dom);
        yield new Date(y, month, day);
      }
      break;
    }
    default:
      break;
  }
}

/** N najbliższych wystąpień od `fromDate` (z uwzględnieniem endDate szablonu). */
export function nextNOccurrences(
  tmpl: Pick<RecurringTemplate, "frequency" | "startDate" | "endDate" | "dayOfMonth" | "weekday">,
  n: number,
  fromDate: Date = new Date(),
): Date[] {
  const rs = startOfDay(fromDate);
  const tEnd = tmpl.endDate ? endOfDay(tmpl.endDate) : null;
  const seq = enumerateOccurrences(tmpl);
  const out: Date[] = [];
  for (const d of seq) {
    const ds = startOfDay(d);
    if (isBefore(ds, rs)) continue;
    if (tEnd && isAfter(ds, tEnd)) break;
    out.push(ds);
    if (out.length >= n) break;
  }
  return out;
}
