import { Decimal } from "@prisma/client/runtime/library";
import { normalizeDecimalInput } from "@/lib/decimal-input";

/** Po normalizacji i zaokrągleniu do groszy — tolerancja na rozjazd float / pośrednie obliczenia. */
const MONEY_EPS = new Decimal("0.02");

function parseMoney(raw: string): Decimal {
  const s = normalizeDecimalInput(String(raw).trim());
  return new Decimal(s === "" ? "0" : s);
}

function sumMoneyStrings(values: string[]): Decimal {
  let t = new Decimal(0);
  for (const v of values) t = t.add(parseMoney(v));
  return t;
}

/** Kwoty w PLN liczymy jak w księgowości: 2 miejsca po przecinku, potem porównanie. */
function roundMoneyPLN(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function validateCostOrIncomeAllocationSums(
  rows: { netAmount: string; grossAmount: string }[],
  documentNet: string,
  documentGross: string,
): string | null {
  if (rows.length === 0) return null;
  const sn = roundMoneyPLN(sumMoneyStrings(rows.map((r) => r.netAmount)));
  const sg = roundMoneyPLN(sumMoneyStrings(rows.map((r) => r.grossAmount)));
  const dn = roundMoneyPLN(parseMoney(documentNet));
  const dg = roundMoneyPLN(parseMoney(documentGross));
  if (sn.minus(dn).abs().greaterThan(MONEY_EPS)) {
    return `Suma alokacji netto (${sn.toFixed(2)} PLN) musi równać się kwocie netto dokumentu (${dn.toFixed(2)} PLN).`;
  }
  if (sg.minus(dg).abs().greaterThan(MONEY_EPS)) {
    return `Suma alokacji brutto (${sg.toFixed(2)} PLN) musi równać się kwocie brutto dokumentu (${dg.toFixed(2)} PLN).`;
  }
  return null;
}

export function validatePlannedAllocationSums(
  rows: { amount: string; amountVat: string }[],
  documentAmount: string,
  documentAmountVat: string,
): string | null {
  if (rows.length === 0) return null;
  const sa = roundMoneyPLN(sumMoneyStrings(rows.map((r) => r.amount)));
  const sv = roundMoneyPLN(sumMoneyStrings(rows.map((r) => r.amountVat)));
  const da = roundMoneyPLN(parseMoney(documentAmount));
  const dv = roundMoneyPLN(parseMoney(documentAmountVat));
  if (sa.minus(da).abs().greaterThan(MONEY_EPS)) {
    return `Suma alokacji kwoty głównej (${sa.toFixed(2)}) musi równać się kwocie zdarzenia (${da.toFixed(2)}).`;
  }
  if (sv.minus(dv).abs().greaterThan(MONEY_EPS)) {
    return `Suma alokacji VAT (${sv.toFixed(2)}) musi równać się części VAT zdarzenia (${dv.toFixed(2)}).`;
  }
  return null;
}
