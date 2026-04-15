import { normalizeDecimalInput } from "@/lib/decimal-input";

/** Wagi do rozkładu proporcjonalnego (zwykle brutto z alokacji dokumentu). */
export type DocumentGrossSlice = { projectId: string; weight: number };

function grossToNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return Number(normalizeDecimalInput(v)) || 0;
  if (v != null && typeof v === "object" && "toString" in v) {
    return Number(normalizeDecimalInput(String((v as { toString(): string }).toString()))) || 0;
  }
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function documentGrossSlicesFromInvoice(inv: {
  projectAllocations: { projectId: string; grossAmount: unknown }[];
  grossAmount: unknown;
  projectId: string | null;
}): DocumentGrossSlice[] {
  if (inv.projectAllocations.length > 0) {
    return inv.projectAllocations.map((a) => ({
      projectId: a.projectId,
      weight: grossToNumber(a.grossAmount),
    }));
  }
  if (inv.projectId) {
    return [{ projectId: inv.projectId, weight: grossToNumber(inv.grossAmount) }];
  }
  return [];
}

/**
 * Kwota brutto płatności przypisana do projektów (odczyt raportowy).
 * Jawne wiersze payment allocation mają pierwszeństwo; inaczej rozkład proporcjonalny do wag dokumentu.
 */
export function distributePaymentGrossForReporting(
  paymentGross: number,
  paymentAllocs: { projectId: string; grossAmount: unknown }[] | null | undefined,
  docSlices: DocumentGrossSlice[],
): Map<string, number> {
  const m = new Map<string, number>();
  if (paymentAllocs && paymentAllocs.length > 0) {
    for (const a of paymentAllocs) {
      const g = grossToNumber(a.grossAmount);
      m.set(a.projectId, (m.get(a.projectId) ?? 0) + g);
    }
    return m;
  }
  if (docSlices.length === 0) return m;
  const pay = round2(Math.max(0, paymentGross));
  const totalW = round2(docSlices.reduce((s, x) => s + round2(x.weight), 0));
  if (totalW <= 0) {
    if (docSlices.length === 1) m.set(docSlices[0]!.projectId, pay);
    return m;
  }
  if (docSlices.length === 1) {
    m.set(docSlices[0]!.projectId, pay);
    return m;
  }
  let acc = 0;
  for (let i = 0; i < docSlices.length; i++) {
    const slice = docSlices[i]!;
    if (i === docSlices.length - 1) {
      m.set(slice.projectId, round2(pay - acc));
    } else {
      const w = round2(slice.weight);
      const share = round2((pay * w) / totalW);
      m.set(slice.projectId, share);
      acc = round2(acc + share);
    }
  }
  return m;
}
