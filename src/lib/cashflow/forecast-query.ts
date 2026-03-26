import { addDays, isValid, parseISO, startOfDay, startOfMonth } from "date-fns";

/** Domyślnie: od 1. dnia bieżącego miesiąca; koniec `to` albo `days` (od `from`). */
export function parseForecastRange(searchParams: URLSearchParams): { from: Date; to: Date } {
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const daysRaw = searchParams.get("days");

  let from: Date;
  if (fromStr) {
    const d = parseISO(fromStr);
    from = isValid(d) ? startOfDay(d) : startOfMonth(new Date());
  } else {
    from = startOfMonth(new Date());
  }

  let to: Date;
  if (toStr) {
    const d = parseISO(toStr);
    to = isValid(d) ? startOfDay(d) : addDays(from, 30);
  } else {
    const n = Number(daysRaw);
    const days = Number.isFinite(n) && n > 0 ? Math.min(36500, Math.floor(n)) : 30;
    to = addDays(from, days);
  }

  if (to.getTime() < from.getTime()) {
    to = from;
  }
  return { from, to };
}
