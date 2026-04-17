import type {
  AppSettings,
  CostInvoice,
  CostInvoicePayment,
  IncomeInvoice,
  IncomeInvoicePayment,
  IncomeInvoicePlannedPayment,
  OtherIncome,
  PlannedFinancialEvent,
} from "@prisma/client";
import { addDays, isBefore, startOfDay } from "date-fns";
import { dayKey, parseDayKey } from "./dates";
import { decToNumber, round2 } from "./money";
import {
  costPaymentDeltas,
  costPaymentDeltasVatFirst,
  costRemainingGross,
  incomePaymentDeltas,
  incomePaymentMainVatParts,
  incomeRemainingGross,
  incomeRemainingMainVat,
  isCostFullyPaid,
  isIncomeFullyPaid,
  PAY_EPS,
} from "./settlement";

export type MovementKind = "income" | "cost" | "planned" | "other_income";

export type CashflowMovement = {
  kind: MovementKind;
  refId: string;
  label: string;
  dayKey: string;
  mainDelta: number;
  vatDelta: number;
  /** Koszt VAT_THEN_MAIN — delty liczone w prognozie wg salda VAT przed ruchem */
  splitCost?: { invoiceId: string; amountGross: number };
};

export type ForecastDayRow = {
  dayKey: string;
  mainStart: number;
  vatStart: number;
  mainInflows: number;
  mainOutflows: number;
  vatInflows: number;
  vatOutflows: number;
  mainEnd: number;
  vatEnd: number;
  totalEnd: number;
  movements: CashflowMovement[];
};

/** Pełne brutto dokumentu (jak jedna wpłata). */
export function incomeDeltas(inv: IncomeInvoice): { main: number; vat: number } {
  return incomePaymentDeltas(inv, decToNumber(inv.grossAmount));
}

export function costDeltas(inv: CostInvoice): { main: number; vat: number } {
  return costPaymentDeltas(inv, decToNumber(inv.grossAmount));
}

function plannedEventMovement(ev: PlannedFinancialEvent): CashflowMovement | null {
  if (ev.status === "CANCELLED" || ev.status === "CONVERTED") return null;
  const d = ev.plannedDate;
  const mainAmt = decToNumber(ev.amount);
  const vatAmt = decToNumber(ev.amountVat ?? 0);
  const sign = ev.type === "INCOME" ? 1 : -1;
  return {
    kind: "planned",
    refId: ev.id,
    label: ev.title,
    dayKey: dayKey(d),
    mainDelta: round2(sign * mainAmt),
    vatDelta: round2(sign * vatAmt),
  };
}

/** Wiersze harmonogramu używane w prognozie — tylko status PLANNED. */
export function activeIncomePlanRows(
  inv: IncomeInvoice & { plannedPayments?: IncomeInvoicePlannedPayment[] },
): IncomeInvoicePlannedPayment[] {
  return (inv.plannedPayments ?? [])
    .filter((p) => p.status === "PLANNED")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Rozkłada pozostałe MAIN/VAT proporcjonalnie do kwot w planie — suma zwróconych wierszy ≈ reszta po wpłatach,
 * bez „podwójnego” liczenia przy częściowych wpłatach rzeczywistych.
 */
export function remainderSplitByIncomePlan(
  inv: IncomeInvoice,
  payments: IncomeInvoicePayment[],
  rows: IncomeInvoicePlannedPayment[],
): { dueDate: Date; main: number; vat: number; idx: number }[] {
  const { remMain, remVat } = incomeRemainingMainVat(inv, payments);
  if (remMain <= PAY_EPS && remVat <= PAY_EPS) return [];
  let sumM = 0;
  let sumV = 0;
  for (const r of rows) {
    sumM += decToNumber(r.plannedMainAmount);
    sumV += decToNumber(r.plannedVatAmount);
  }
  const n = rows.length;
  if (n === 0) return [];

  return rows.map((r, idx) => {
    const pm = decToNumber(r.plannedMainAmount);
    const pv = decToNumber(r.plannedVatAmount);
    const main =
      sumM > PAY_EPS ? round2(remMain * (pm / sumM)) : n > 0 ? round2(remMain / n) : 0;
    const vat =
      sumV > PAY_EPS ? round2(remVat * (pv / sumV)) : n > 0 ? round2(remVat / n) : 0;
    return { dueDate: r.dueDate, main, vat, idx };
  });
}

function appendIncomeMovements(
  inv: IncomeInvoice & { payments: IncomeInvoicePayment[]; plannedPayments?: IncomeInvoicePlannedPayment[] },
  out: CashflowMovement[],
) {
  const label = `Przychód ${inv.invoiceNumber}`;

  if (inv.payments.length === 0 && inv.status === "OPLACONA") {
    const d = inv.actualIncomeDate ?? inv.plannedIncomeDate;
    const { main, vat } = incomePaymentDeltas(inv, decToNumber(inv.grossAmount));
    out.push({
      kind: "income",
      refId: inv.id,
      label,
      dayKey: dayKey(d),
      mainDelta: round2(main),
      vatDelta: round2(vat),
    });
    return;
  }

  for (const p of inv.payments) {
    const { main, vat } = incomePaymentMainVatParts(inv, p);
    out.push({
      kind: "income",
      refId: `${inv.id}-p-${p.id}`,
      label: `${label} (wpłata)`,
      dayKey: dayKey(p.paymentDate),
      mainDelta: round2(main),
      vatDelta: round2(vat),
    });
  }

  const { remMain, remVat } = incomeRemainingMainVat(inv, inv.payments);
  if (remMain <= PAY_EPS && remVat <= PAY_EPS) return;

  const planRows = activeIncomePlanRows(inv);
  if (planRows.length > 0) {
    const splits = remainderSplitByIncomePlan(inv, inv.payments, planRows);
    if (splits.length > 0) {
      for (const s of splits) {
        if (s.main <= PAY_EPS && s.vat <= PAY_EPS) continue;
        out.push({
          kind: "income",
          refId: `${inv.id}-plan-${s.idx}`,
          label: `${label} (plan ${s.idx + 1})`,
          dayKey: dayKey(s.dueDate),
          mainDelta: round2(s.main),
          vatDelta: round2(s.vat),
        });
      }
      return;
    }
  }

  out.push({
    kind: "income",
    refId: `${inv.id}-rem`,
    label: `${label} (pozostało)`,
    dayKey: dayKey(inv.plannedIncomeDate),
    mainDelta: round2(remMain),
    vatDelta: round2(remVat),
  });
}

function pushCostMovement(
  inv: CostInvoice & { payments: CostInvoicePayment[] },
  amountGross: number,
  refId: string,
  label: string,
  d: Date,
  out: CashflowMovement[],
) {
  const dk = dayKey(d);
  if (inv.paymentSource === "VAT_THEN_MAIN") {
    out.push({
      kind: "cost",
      refId,
      label,
      dayKey: dk,
      mainDelta: 0,
      vatDelta: 0,
      splitCost: { invoiceId: inv.id, amountGross: round2(amountGross) },
    });
    return;
  }
  const { main, vat } = costPaymentDeltas(inv, amountGross);
  out.push({
    kind: "cost",
    refId,
    label,
    dayKey: dk,
    mainDelta: round2(main),
    vatDelta: round2(vat),
  });
}

function appendOtherIncomeMovements(rows: OtherIncome[], out: CashflowMovement[]) {
  for (const oi of rows) {
    const gross = decToNumber(oi.amountGross);
    const vat = decToNumber(oi.vatAmount);
    const label = oi.description.trim() || "Pozostały przychód (bez faktury)";
    out.push({
      kind: "other_income",
      refId: oi.id,
      label,
      dayKey: dayKey(oi.date),
      mainDelta: round2(gross - vat),
      vatDelta: round2(vat),
    });
  }
}

function appendCostMovements(inv: CostInvoice & { payments: CostInvoicePayment[] }, out: CashflowMovement[]) {
  const label = `Koszt ${inv.documentNumber}`;

  if (inv.payments.length === 0 && inv.paid) {
    const d = inv.actualPaymentDate ?? inv.plannedPaymentDate;
    pushCostMovement(inv, decToNumber(inv.grossAmount), inv.id, label, d, out);
    return;
  }

  for (const p of inv.payments) {
    const amt = decToNumber(p.amountGross);
    pushCostMovement(inv, amt, `${inv.id}-p-${p.id}`, `${label} (płatność)`, p.paymentDate, out);
  }

  const rem = costRemainingGross(inv, inv.payments);
  if (rem > PAY_EPS) {
    pushCostMovement(inv, rem, `${inv.id}-rem`, `${label} (pozostało)`, inv.plannedPaymentDate, out);
  }
}

export function collectMovements(
  incomes: (IncomeInvoice & { payments: IncomeInvoicePayment[]; plannedPayments?: IncomeInvoicePlannedPayment[] })[],
  costs: (CostInvoice & { payments: CostInvoicePayment[] })[],
  events: PlannedFinancialEvent[],
  otherIncomes: OtherIncome[] = [],
): CashflowMovement[] {
  const out: CashflowMovement[] = [];

  for (const inv of incomes) {
    appendIncomeMovements(inv, out);
  }

  appendOtherIncomeMovements(otherIncomes, out);

  for (const inv of costs) {
    appendCostMovements(inv, out);
  }

  for (const ev of events) {
    const m = plannedEventMovement(ev);
    if (m) out.push(m);
  }

  return out.sort((a, b) => {
    if (a.dayKey !== b.dayKey) return a.dayKey.localeCompare(b.dayKey);
    const order: Record<CashflowMovement["kind"], number> = {
      income: 0,
      other_income: 0,
      cost: 1,
      planned: 2,
    };
    return order[a.kind] - order[b.kind] || a.refId.localeCompare(b.refId);
  });
}

export function costInvoiceMap(costs: CostInvoice[]): Map<string, CostInvoice> {
  return new Map(costs.map((c) => [c.id, c]));
}

function groupByDay(movements: CashflowMovement[]): Map<string, CashflowMovement[]> {
  const m = new Map<string, CashflowMovement[]>();
  for (const mv of movements) {
    const arr = m.get(mv.dayKey) ?? [];
    arr.push(mv);
    m.set(mv.dayKey, arr);
  }
  return m;
}

function previousCalendarDay(dayKeyStr: string): string {
  const d = addDays(parseDayKey(dayKeyStr), -1);
  return dayKey(d);
}

function enumerateDayKeys(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let d = parseDayKey(fromKey);
  const end = parseDayKey(toKey);
  while (d.getTime() <= end.getTime()) {
    out.push(dayKey(d));
    d = addDays(d, 1);
  }
  return out;
}

function sortDayMoves(dayMoves: CashflowMovement[]): CashflowMovement[] {
  return dayMoves.slice().sort((a, b) => {
    const order: Record<CashflowMovement["kind"], number> = {
      income: 0,
      other_income: 0,
      cost: 1,
      planned: 2,
    };
    return order[a.kind] - order[b.kind] || a.refId.localeCompare(b.refId);
  });
}

/** Saldo po zastosowaniu ruchów danego dnia (bez rozwiązywania listy do UI). */
function applyDayMovementsRaw(
  mainStart: number,
  vatStart: number,
  dayMoves: CashflowMovement[],
  costById: Map<string, CostInvoice>,
): { mainEnd: number; vatEnd: number } {
  let main = mainStart;
  let vat = vatStart;
  for (const m of sortDayMoves(dayMoves)) {
    if (m.splitCost) {
      const inv = costById.get(m.splitCost.invoiceId);
      if (!inv) continue;
      const d = costPaymentDeltasVatFirst(inv, m.splitCost.amountGross, vat);
      main = round2(main + d.main);
      vat = round2(vat + d.vat);
    } else {
      main = round2(main + m.mainDelta);
      vat = round2(vat + m.vatDelta);
    }
  }
  return { mainEnd: main, vatEnd: vat };
}

function resolveDayMovements(
  mainStart: number,
  vatStart: number,
  dayMoves: CashflowMovement[],
  costById: Map<string, CostInvoice>,
): {
  mainEnd: number;
  vatEnd: number;
  movements: CashflowMovement[];
  mainInflows: number;
  mainOutflows: number;
  vatInflows: number;
  vatOutflows: number;
} {
  let main = mainStart;
  let vat = vatStart;
  let mainIn = 0,
    mainOut = 0,
    vatIn = 0,
    vatOut = 0;
  const movements: CashflowMovement[] = [];
  for (const m of sortDayMoves(dayMoves)) {
    let dm: number;
    let dv: number;
    if (m.splitCost) {
      const inv = costById.get(m.splitCost.invoiceId);
      if (!inv) continue;
      const d = costPaymentDeltasVatFirst(inv, m.splitCost.amountGross, vat);
      dm = d.main;
      dv = d.vat;
      movements.push({
        kind: m.kind,
        refId: m.refId,
        label: m.label,
        dayKey: m.dayKey,
        mainDelta: dm,
        vatDelta: dv,
      });
    } else {
      dm = m.mainDelta;
      dv = m.vatDelta;
      movements.push(m);
    }
    main = round2(main + dm);
    vat = round2(vat + dv);
    if (dm > 0) mainIn += dm;
    else mainOut += dm;
    if (dv > 0) vatIn += dv;
    else vatOut += dv;
  }
  return {
    mainEnd: main,
    vatEnd: vat,
    movements,
    mainInflows: round2(mainIn),
    mainOutflows: round2(mainOut),
    vatInflows: round2(vatIn),
    vatOutflows: round2(vatOut),
  };
}

export function endBalanceAfterDay(
  movementsByDay: Map<string, CashflowMovement[]>,
  settings: AppSettings | null,
  throughDayKey: string,
  costById: Map<string, CostInvoice>,
): { main: number; vat: number } {
  if (movementsByDay.size === 0 && !settings) {
    return { main: 0, vat: 0 };
  }

  const effK = settings ? dayKey(settings.effectiveFrom) : null;
  const movKeys = [...movementsByDay.keys()].sort();
  const minMovK = movKeys[0] ?? null;

  /**
   * Początek symulacji: najwcześniejszy dzień spośród pierwszego ruchu i effectiveFrom.
   * Nie wolno brać min() razem z throughDayKey — gdy „dzień końcowy” salda jest wcześniejszy
   * niż pierwszy ruch (np. saldo na 28.02 przy pierwszym ruchu w kwietniu), throughDay byłby
   * najmniejszy i pętla obejmowałaby tylko ten dzień, pomijając całą wcześniejszą historię.
   * Jeśli pierwszy istotny dzień jest po throughDayKey, zaczynamy od throughDayKey (jeden przebieg).
   */
  const metaDays = [effK, minMovK].filter((x): x is string => x != null).sort();
  const earliestMeta = metaDays[0] ?? null;
  const walkStart =
    earliestMeta != null ?
      earliestMeta <= throughDayKey ?
        earliestMeta
      : throughDayKey
    : throughDayKey;

  const dayList = enumerateDayKeys(walkStart, throughDayKey);

  let mainEnd = 0;
  let vatEnd = 0;

  for (const k of dayList) {
    let ms: number;
    let vs: number;
    if (effK && k === effK) {
      ms = decToNumber(settings!.mainOpeningBalance);
      vs = decToNumber(settings!.vatOpeningBalance);
    } else {
      ms = mainEnd;
      vs = vatEnd;
    }
    const { mainEnd: me, vatEnd: ve } = applyDayMovementsRaw(ms, vs, movementsByDay.get(k) ?? [], costById);
    mainEnd = me;
    vatEnd = ve;
  }

  return { main: mainEnd, vat: vatEnd };
}

export function buildDailyForecast(
  movements: CashflowMovement[],
  settings: AppSettings | null,
  from: Date,
  to: Date,
  costById: Map<string, CostInvoice>,
): ForecastDayRow[] {
  const movementsByDay = groupByDay(movements);
  const fromK = dayKey(startOfDay(from));
  const toK = dayKey(startOfDay(to));
  const rows: ForecastDayRow[] = [];

  /** Ten sam dzień co w endBalanceAfterDay — musi być spójny z `k === effK` w symulacji dzień po dniu. */
  const effK = settings ? dayKey(settings.effectiveFrom) : null;
  const effNextK = effK ? dayKey(addDays(parseDayKey(effK), 1)) : null;

  /** Saldo na koniec dnia przed pierwszym dniem okna — jeden pełny przebieg historii. */
  const beforeFirst = endBalanceAfterDay(movementsByDay, settings, previousCalendarDay(fromK), costById);
  let carryMain = beforeFirst.main;
  let carryVat = beforeFirst.vat;

  let cursor = startOfDay(from);
  while (!isBefore(startOfDay(to), cursor)) {
    const k = dayKey(cursor);
    if (k < fromK || k > toK) break;

    const rawDayMoves = movementsByDay.get(k) ?? [];

    /**
     * W dniu effectiveFrom saldo otwarcia = wartości z ustawień (jak w endBalanceAfterDay),
     * a nie closing z poprzedniego dnia — inaczej wiersz tego dnia pokazywałby 0 lub błędny carry.
     */
    let mainStart: number;
    let vatStart: number;
    if (effK && k === effK) {
      mainStart = decToNumber(settings!.mainOpeningBalance);
      vatStart = decToNumber(settings!.vatOpeningBalance);
    } else {
      mainStart = carryMain;
      vatStart = carryVat;
    }

    if (process.env.NODE_ENV === "development" && effK && (k === effK || k === effNextK)) {
      const preMain = effK && k === effK ? carryMain : null;
      const preVat = effK && k === effK ? carryVat : null;
      // eslint-disable-next-line no-console -- tymczasowa diagnostyka effectiveFrom
      console.log("[forecast buildDailyForecast]", {
        effK,
        dayKey: k,
        carryBeforeDay: { main: preMain, vat: preVat },
        openingAfterSettingsRule: { main: mainStart, vat: vatStart },
        rawMoves: rawDayMoves.length,
      });
    }

    const {
      mainEnd,
      vatEnd,
      movements: dayMovesResolved,
      mainInflows,
      mainOutflows,
      vatInflows,
      vatOutflows,
    } = resolveDayMovements(mainStart, vatStart, rawDayMoves, costById);

    carryMain = mainEnd;
    carryVat = vatEnd;

    if (process.env.NODE_ENV === "development" && effK && (k === effK || k === effNextK)) {
      // eslint-disable-next-line no-console -- tymczasowa diagnostyka effectiveFrom
      console.log("[forecast buildDailyForecast] closing", { dayKey: k, mainEnd, vatEnd });
    }

    rows.push({
      dayKey: k,
      mainStart: round2(mainStart),
      vatStart: round2(vatStart),
      mainInflows,
      mainOutflows,
      vatInflows,
      vatOutflows,
      mainEnd,
      vatEnd,
      totalEnd: round2(mainEnd + vatEnd),
      movements: dayMovesResolved,
    });

    cursor = addDays(cursor, 1);
  }
  return rows;
}

export function currentBalances(
  movements: CashflowMovement[],
  settings: AppSettings | null,
  now = new Date(),
  costById: Map<string, CostInvoice> = new Map(),
): { main: number; vat: number; total: number } {
  const movementsByDay = groupByDay(movements);
  const k = dayKey(now);
  const { main, vat } = endBalanceAfterDay(movementsByDay, settings, k, costById);
  return { main, vat, total: round2(main + vat) };
}

export type PlannedWindowSums = {
  plannedInflowTotal: number;
  plannedOutflowTotal: number;
};

export function plannedMainFlowsInWindow(
  incomes: (IncomeInvoice & { payments: IncomeInvoicePayment[] })[],
  costs: (CostInvoice & { payments: CostInvoicePayment[] })[],
  events: PlannedFinancialEvent[],
  days: number,
  now = new Date(),
): PlannedWindowSums {
  const start = startOfDay(now);
  const end = addDays(start, days);
  let plannedInflowTotal = 0;
  let plannedOutflowTotal = 0;

  for (const inv of incomes) {
    if (isIncomeFullyPaid(inv, inv.payments)) continue;
    const { remMain } = incomeRemainingMainVat(inv, inv.payments);
    if (remMain <= 0) continue;
    const rows = activeIncomePlanRows(inv);
    if (rows.length > 0) {
      const splits = remainderSplitByIncomePlan(inv, inv.payments, rows);
      for (const s of splits) {
        if (s.main <= PAY_EPS) continue;
        if (isBefore(s.dueDate, start) || !isBefore(s.dueDate, end)) continue;
        plannedInflowTotal += s.main;
      }
    } else {
      const d = inv.plannedIncomeDate;
      if (isBefore(d, start) || !isBefore(d, end)) continue;
      plannedInflowTotal += remMain;
    }
  }

  for (const inv of costs) {
    if (isCostFullyPaid(inv, inv.payments)) continue;
    const d = inv.plannedPaymentDate;
    if (isBefore(d, start) || !isBefore(d, end)) continue;
    const rem = costRemainingGross(inv, inv.payments);
    const { main } = costPaymentDeltas(inv, rem);
    if (main < 0) plannedOutflowTotal += -main;
  }

  for (const ev of events) {
    if (ev.status !== "PLANNED") continue;
    const d = ev.plannedDate;
    if (isBefore(d, start) || !isBefore(d, end)) continue;
    const total = decToNumber(ev.amount) + decToNumber(ev.amountVat ?? 0);
    if (ev.type === "INCOME") plannedInflowTotal += total;
    else plannedOutflowTotal += total;
  }

  return {
    plannedInflowTotal: round2(plannedInflowTotal),
    plannedOutflowTotal: round2(plannedOutflowTotal),
  };
}

export function mainAccountNegativeInForecast(rows: ForecastDayRow[]): boolean {
  return rows.some((r) => r.mainEnd < 0);
}
