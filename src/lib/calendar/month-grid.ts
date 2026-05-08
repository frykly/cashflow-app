/** Siatka miesiąca od poniedziałku tygodnia pierwszego dnia do niedzieli tygodnia ostatniego dnia (lokalny czas). */

export function localDayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function dayStartMs(d: Date): number {
  return localDayStart(d).getTime();
}

export function dayKeyFromDate(d: Date): string {
  const x = localDayStart(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function mondayOfWeekContaining(d: Date): Date {
  const x = localDayStart(d);
  const day = x.getDay();
  const diffToMonday = (day + 6) % 7;
  x.setDate(x.getDate() - diffToMonday);
  return x;
}

export function sundayOfWeekContaining(d: Date): Date {
  const mon = mondayOfWeekContaining(d);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return localDayStart(sun);
}

export type MonthGridCell = {
  date: Date;
  dayKey: string;
  inMonth: boolean;
};

export function buildMonthGrid(year: number, month1to12: number): { cells: MonthGridCell[]; weekRows: MonthGridCell[][] } {
  const first = new Date(year, month1to12 - 1, 1);
  const last = new Date(year, month1to12, 0);
  const gridStart = mondayOfWeekContaining(first);
  const gridEnd = sundayOfWeekContaining(last);

  const cells: MonthGridCell[] = [];
  const cur = new Date(gridStart);
  const endMs = gridEnd.getTime();
  while (cur.getTime() <= endMs) {
    cells.push({
      date: new Date(cur),
      dayKey: dayKeyFromDate(cur),
      inMonth: cur.getMonth() === month1to12 - 1,
    });
    cur.setDate(cur.getDate() + 1);
  }

  const weekRows: MonthGridCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weekRows.push(cells.slice(i, i + 7));
  }
  return { cells, weekRows };
}

export function parseYm(raw: string | null | undefined): { year: number; month: number } {
  const now = new Date();
  const defY = now.getFullYear();
  const defM = now.getMonth() + 1;
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return { year: defY, month: defM };
  const [ys, ms] = raw.split("-");
  const year = Number(ys);
  const month = Number(ms);
  if (year < 1970 || year > 2100 || month < 1 || month > 12) return { year: defY, month: defM };
  return { year, month };
}

export function formatYm(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function buildCalendarQuery(params: { ym: string; assignee?: string; hideDone?: boolean }): string {
  const p = new URLSearchParams();
  p.set("ym", params.ym);
  if (params.assignee?.trim()) p.set("assignee", params.assignee.trim());
  if (params.hideDone) p.set("hideDone", "1");
  return `?${p.toString()}`;
}
