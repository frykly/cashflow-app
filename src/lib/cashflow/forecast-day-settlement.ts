import type { CostInvoice, IncomeInvoice, PlannedFinancialEvent } from "@prisma/client";
import type { CashflowMovement } from "@/lib/cashflow/forecast";

export type ForecastSettlementContext = {
  incomesById: Map<string, IncomeInvoice & { payments: { id: string }[] }>;
  costsById: Map<string, CostInvoice & { payments: { id: string }[] }>;
  eventsById: Map<string, PlannedFinancialEvent>;
};

/**
 * Czy pojedynczy ruch z prognozy reprezentuje już rozliczoną pozycję (wpłata/wypłata zaksięgowana,
 * plan bez „dziury”, plan zamknięty itd.). Nie dotyczy checkboxów bankowych — wyłącznie dane księgowe.
 */
export function isForecastMovementSettled(m: Pick<CashflowMovement, "kind" | "refId">, ctx: ForecastSettlementContext): boolean {
  const refId = m.refId ?? "";

  if (m.kind === "income") {
    if (refId.includes("-p-")) return true;
    if (refId.includes("-plan-") || refId.endsWith("-rem")) return false;
    return true;
  }

  if (m.kind === "cost") {
    if (refId.includes("-p-")) return true;
    if (refId.endsWith("-rem")) return false;
    return true;
  }

  if (m.kind === "planned") {
    const ev = ctx.eventsById.get(refId);
    if (!ev) return true;
    return ev.status !== "PLANNED";
  }

  if (m.kind === "other_income") {
    /** Zaksięgowany przychód poza fakturą — uznajemy za rozliczony (kwota już w cashflow; brak osobnego „planu”). */
    return true;
  }

  return true;
}

/** Dzień „na zielono” w sensie rozliczeń: brak ruchów albo każdy ruch uznany za rozliczony. */
export function isForecastDayCashflowSettled(
  movements: Pick<CashflowMovement, "kind" | "refId">[],
  ctx: ForecastSettlementContext,
): boolean {
  if (movements.length === 0) return true;
  return movements.every((mv) => isForecastMovementSettled(mv, ctx));
}
