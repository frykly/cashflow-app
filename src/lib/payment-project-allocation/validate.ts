import { Decimal } from "@prisma/client/runtime/library";
import { normalizeDecimalInput } from "@/lib/decimal-input";

const MONEY_EPS = new Decimal("0.02");

function parseMoney(raw: string): Decimal {
  const s = normalizeDecimalInput(String(raw).trim());
  return new Decimal(s === "" ? "0" : s);
}

function sumGrossRows(rows: { grossAmount: string }[]): Decimal {
  let t = new Decimal(0);
  for (const r of rows) t = t.add(parseMoney(r.grossAmount));
  return t;
}

function roundMoneyPLN(d: Decimal): Decimal {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Walidacja przy zapisie jawnych alokacji brutto płatności. */
export function validatePaymentProjectAllocationGrossSum(
  rows: { grossAmount: string }[],
  paymentGross: string,
): string | null {
  if (rows.length === 0) return null;
  const sg = roundMoneyPLN(sumGrossRows(rows));
  const pg = roundMoneyPLN(parseMoney(paymentGross));
  if (sg.minus(pg).abs().greaterThan(MONEY_EPS)) {
    return `Suma alokacji brutto płatności (${sg.toFixed(2)} PLN) musi równać się kwocie brutto płatności (${pg.toFixed(2)} PLN).`;
  }
  return null;
}
