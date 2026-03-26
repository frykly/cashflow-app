/**
 * Normalizacja wpisu kwotowego: usuwa spacje/NBSP, przecinek → kropka (separator dziesiętny).
 * Nie usuwa wielu kropek — zakładamy jeden separator jak w PL (1234,56 lub 1234.56).
 */
export function normalizeDecimalInput(raw: string): string {
  return String(raw)
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(",", ".");
}

/** Parsowanie do liczby; puste / niepoprawne → NaN (sprawdź Number.isFinite). */
export function parseDecimalNumber(raw: string): number {
  const n = Number(normalizeDecimalInput(raw));
  return Number.isFinite(n) ? n : NaN;
}
