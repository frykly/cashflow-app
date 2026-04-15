import { normalizeDecimalInput } from "@/lib/decimal-input";

/**
 * Pełna kwota w formacie PL — nie fragmenty typu „14” z „14 810,21”.
 *
 * 1) Grupy tysięcy (dowolny biały znak Unicode, w tym wąskie spacje z PDF) + grosze
 * 2) ≥4 cyfry + przecinek + grosze: `14810,21`, `2644,50`
 * 3) ≥4 cyfry + kropka + grosze: `14810.21` — `(?![.\d])` odcina `2026.04` z dat
 * 4) 1–3 cyfry + przecinek + grosze: `100,00`
 * 5) 3 cyfry + kropka + grosze: `100.00`
 */
export const PL_MONEY_REGEX =
  /(?:\d{1,3}(?:\s+\d{3})+)(?:[.,]\d{2})(?!\d)|(?:\d{4,})(?:,\d{2})(?!\d)|(?:\d{4,})\.\d{2}(?![.\d])|\d{1,3},\d{2}(?!\d)|\d{3}\.\d{2}(?!\d)/g;

export type PlMoneyToken = { raw: string; value: number };

/** Wszystkie pełne kwoty w kolejności wystąpienia (string surowy + wartość). */
export function extractPlMoneyTokens(segment: string): PlMoneyToken[] {
  const out: PlMoneyToken[] = [];
  for (const m of segment.matchAll(PL_MONEY_REGEX)) {
    const raw = m[0];
    const value = plMoneyStringToNumber(raw);
    if (value != null && Number.isFinite(value) && value > 0) {
      out.push({ raw, value });
    }
  }
  return out;
}

export function plMoneyStringToNumber(raw: string): number | null {
  const t = normalizeDecimalInput(raw);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
