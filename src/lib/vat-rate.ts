/** Stawki VAT w UI i API (bez zależności od Prisma — bezpieczne dla bundla klienta). */

import { normalizeDecimalInput } from "./decimal-input";

export type VatRatePct = 0 | 8 | 23;

export function inferVatRateFromAmounts(net: number, vat: number): VatRatePct {
  if (!Number.isFinite(net) || net <= 0 || !Number.isFinite(vat)) return 23;
  const ratio = Math.round((vat / net) * 100);
  const candidates: VatRatePct[] = [0, 8, 23];
  let best: VatRatePct = 23;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = Math.abs(c - ratio);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

export function amountsFromNetRate(net: string, rate: VatRatePct): { vatAmount: string; grossAmount: string } {
  const n = Number(normalizeDecimalInput(net)) || 0;
  const vat = ((n * rate) / 100).toFixed(2);
  const gross = (n + Number(vat)).toFixed(2);
  return { vatAmount: vat, grossAmount: gross };
}

/**
 * Z kwoty brutto i stawki VAT — netto i VAT (2 miejsca po przecinku, spójnie z net→brutto).
 * 0%: netto = brutto, VAT = 0.
 */
export function amountsFromGrossRate(gross: string, rate: VatRatePct): { netAmount: string; vatAmount: string } {
  const g = Number(normalizeDecimalInput(gross)) || 0;
  if (rate === 0) {
    return { netAmount: g.toFixed(2), vatAmount: "0.00" };
  }
  const factor = 1 + rate / 100;
  const net = Math.round((g / factor) * 100) / 100;
  const vat = Math.round((g - net) * 100) / 100;
  return { netAmount: net.toFixed(2), vatAmount: vat.toFixed(2) };
}
