import { normalizeDecimalInput } from "@/lib/decimal-input";

const NET_EPS = 0.0001;

function toNum(x: unknown): number {
  if (x === null || x === undefined) return NaN;
  if (typeof x === "number") return x;
  if (typeof x === "string") return Number(normalizeDecimalInput(x));
  if (typeof x === "object" && x !== null && "toString" in x) {
    return Number(normalizeDecimalInput(String((x as { toString(): string }).toString())));
  }
  return NaN;
}

/** Czy zapisany dokument wygląda na tryb „tylko VAT” (netto ~0, VAT > 0). Bez zależności od Prisma — bezpieczne dla klienta. */
export function isStoredVatOnlyCost(net: unknown, vat: unknown): boolean {
  const n = toNum(net);
  const v = toNum(vat);
  return Number.isFinite(n) && Math.abs(n) <= NET_EPS && Number.isFinite(v) && v > NET_EPS;
}
