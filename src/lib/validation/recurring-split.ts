export function recurringSplitAmountError(mode: string, amountVat: string | null | undefined): string | null {
  if (mode !== "SPLIT") return null;
  const n = amountVat != null && amountVat !== "" ? Number(amountVat) : NaN;
  if (!Number.isFinite(n) || n <= 0) return "Dla trybu „Główne + VAT” podaj kwotę VAT (większą od zera).";
  return null;
}
