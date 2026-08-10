/** Presety zakresu dat w liście kosztów (kompaktowy filtr „Data”). */

export type CostDatePreset = "all" | "thisMonth" | "prevMonth" | "range";

export type CostDateRange = { from: string; to: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function monthRange(ref: Date = new Date()): CostDateRange {
  const from = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const to = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export function previousMonthRange(ref: Date = new Date()): CostDateRange {
  const from = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const to = new Date(ref.getFullYear(), ref.getMonth(), 0);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export function inferCostDatePreset(dateFrom: string, dateTo: string): CostDatePreset {
  const from = dateFrom.trim();
  const to = dateTo.trim();
  if (!from && !to) return "all";

  const thisM = monthRange();
  if (from === thisM.from && to === thisM.to) return "thisMonth";

  const prevM = previousMonthRange();
  if (from === prevM.from && to === prevM.to) return "prevMonth";

  return "range";
}

export function datesForCostDatePreset(
  preset: CostDatePreset,
  custom?: Partial<CostDateRange>,
): { dateFrom: string | null; dateTo: string | null } {
  if (preset === "all") return { dateFrom: null, dateTo: null };
  if (preset === "thisMonth") {
    const r = monthRange();
    return { dateFrom: r.from, dateTo: r.to };
  }
  if (preset === "prevMonth") {
    const r = previousMonthRange();
    return { dateFrom: r.from, dateTo: r.to };
  }
  const from = custom?.from?.trim() || null;
  const to = custom?.to?.trim() || null;
  return { dateFrom: from, dateTo: to };
}

export const COST_DATE_PRESET_LABELS: Record<CostDatePreset, string> = {
  all: "Wszystkie",
  thisMonth: "Ten miesiąc",
  prevMonth: "Poprzedni miesiąc",
  range: "Zakres dat",
};
