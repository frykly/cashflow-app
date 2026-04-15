import { Decimal } from "@prisma/client/runtime/library";

const MONEY_EPS = new Decimal("0.02");

function sumDecStrings(values: string[]): Decimal {
  let t = new Decimal(0);
  for (const v of values) t = t.add(new Decimal(v));
  return t;
}

export function validateCostOrIncomeAllocationSums(
  rows: { netAmount: string; grossAmount: string }[],
  documentNet: string,
  documentGross: string,
): string | null {
  if (rows.length === 0) return null;
  const sn = sumDecStrings(rows.map((r) => r.netAmount));
  const sg = sumDecStrings(rows.map((r) => r.grossAmount));
  const dn = new Decimal(documentNet);
  const dg = new Decimal(documentGross);
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
  const sa = sumDecStrings(rows.map((r) => r.amount));
  const sv = sumDecStrings(rows.map((r) => r.amountVat));
  const da = new Decimal(documentAmount);
  const dv = new Decimal(documentAmountVat);
  if (sa.minus(da).abs().greaterThan(MONEY_EPS)) {
    return `Suma alokacji kwoty głównej (${sa.toFixed(2)}) musi równać się kwocie zdarzenia (${da.toFixed(2)}).`;
  }
  if (sv.minus(dv).abs().greaterThan(MONEY_EPS)) {
    return `Suma alokacji VAT (${sv.toFixed(2)}) musi równać się części VAT zdarzenia (${dv.toFixed(2)}).`;
  }
  return null;
}
