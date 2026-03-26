import { format, startOfDay } from "date-fns";

/** Kalendarzowy dzień w strefie lokalnej (YYYY-MM-DD). */
export function dayKey(d: Date): string {
  return format(startOfDay(d), "yyyy-MM-dd");
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return startOfDay(new Date(y, m - 1, d));
}
