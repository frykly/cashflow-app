import type { RecurringTemplate } from "@prisma/client";
import { addDays, addMonths, addYears, endOfDay, getDate, getDay, isAfter, isBefore, startOfDay } from "date-fns";

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

function clampDayInMonth(y: number, m: number, day: number): number {
  return Math.min(day, daysInMonth(y, m));
}

type TmplSchedule = Pick<RecurringTemplate, "frequency" | "startDate" | "dayOfMonth" | "weekday">;

function firstWeeklyWeekdayOnOrAfter(anchor: Date, weekday: number): Date {
  const a = startOfDay(anchor);
  let d = new Date(a);
  let guard = 0;
  while (getDay(d) !== weekday && guard++ < 14) d = addDays(d, 1);
  return startOfDay(d);
}

function firstMonthlyDomOnOrAfter(anchor: Date, dom: number): Date {
  const a = startOfDay(anchor);
  for (let k = 0; k < 500; k++) {
    const base = addMonths(new Date(a.getFullYear(), a.getMonth(), 1), k);
    const y = base.getFullYear();
    const m = base.getMonth();
    const day = clampDayInMonth(y, m, dom);
    const cand = startOfDay(new Date(y, m, day));
    if (!isBefore(cand, a)) return cand;
  }
  return a;
}

function nextMonthlySameDom(prev: Date, dom: number): Date {
  const nm = prev.getMonth() + 1;
  const y = prev.getFullYear() + Math.floor(nm / 12);
  const m = ((nm % 12) + 12) % 12;
  const day = clampDayInMonth(y, m, dom);
  return startOfDay(new Date(y, m, day));
}

function firstQuarterlyDomOnOrAfter(anchor: Date, dom: number): Date {
  const a = startOfDay(anchor);
  const sm = a.getMonth();
  const sy = a.getFullYear();
  for (let k = 0; k < 500; k++) {
    const mAbs = sm + k * 3;
    const y = sy + Math.floor(mAbs / 12);
    const m = ((mAbs % 12) + 12) % 12;
    const day = clampDayInMonth(y, m, dom);
    const cand = startOfDay(new Date(y, m, day));
    if (!isBefore(cand, a)) return cand;
  }
  return a;
}

function nextQuarterlyFrom(prev: Date, dom: number): Date {
  const nm = prev.getMonth() + 3;
  const y = prev.getFullYear() + Math.floor(nm / 12);
  const m = ((nm % 12) + 12) % 12;
  const day = clampDayInMonth(y, m, dom);
  return startOfDay(new Date(y, m, day));
}

function firstYearlyMonthDomOnOrAfter(anchor: Date, month: number, dom: number): Date {
  const a = startOfDay(anchor);
  for (let k = 0; k < 200; k++) {
    const y = a.getFullYear() + k;
    const day = clampDayInMonth(y, month, dom);
    const cand = startOfDay(new Date(y, month, day));
    if (!isBefore(cand, a)) return cand;
  }
  return a;
}

function nextYearlySameMonthDom(prev: Date, month: number, dom: number): Date {
  const y = prev.getFullYear() + 1;
  const day = clampDayInMonth(y, month, dom);
  return startOfDay(new Date(y, month, day));
}

/**
 * Kolejne daty wystąpień harmonogramu, zaczynając od pierwszej daty spełniającej regułę,
 * która jest >= startOfDay(startDate szablonu).
 */
function* enumerateOccurrences(tmpl: TmplSchedule): Generator<Date> {
  const anchor = startOfDay(tmpl.startDate);
  switch (tmpl.frequency) {
    case "WEEKLY": {
      const wd = tmpl.weekday ?? getDay(anchor);
      let d = firstWeeklyWeekdayOnOrAfter(anchor, wd);
      for (let i = 0; i < 520; i++) {
        yield new Date(d);
        d = startOfDay(addDays(d, 7));
      }
      break;
    }
    case "MONTHLY": {
      const dom = tmpl.dayOfMonth ?? getDate(anchor);
      let d = firstMonthlyDomOnOrAfter(anchor, dom);
      for (let i = 0; i < 240; i++) {
        yield new Date(d);
        d = nextMonthlySameDom(d, dom);
      }
      break;
    }
    case "QUARTERLY": {
      const dom = tmpl.dayOfMonth ?? getDate(anchor);
      let d = firstQuarterlyDomOnOrAfter(anchor, dom);
      for (let i = 0; i < 80; i++) {
        yield new Date(d);
        d = nextQuarterlyFrom(d, dom);
      }
      break;
    }
    case "YEARLY": {
      const month = anchor.getMonth();
      const dom = tmpl.dayOfMonth ?? getDate(anchor);
      let d = firstYearlyMonthDomOnOrAfter(anchor, month, dom);
      for (let i = 0; i < 40; i++) {
        yield new Date(d);
        d = nextYearlySameMonthDom(d, month, dom);
      }
      break;
    }
    default:
      break;
  }
}

/** Daty wystąpień powtarzalnego zdarzenia w [rangeStart, rangeEnd]. */
export function occurrenceDatesInRange(
  tmpl: Pick<RecurringTemplate, "frequency" | "startDate" | "endDate" | "dayOfMonth" | "weekday">,
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
