import { normalizeDecimalInput } from "@/lib/decimal-input";
import type { DocumentGrossSlice } from "@/lib/payment-project-allocation/distribute-read";
import { distributePaymentGrossForReporting } from "@/lib/payment-project-allocation/distribute-read";

/** Wiersze do zapisu — domyślnie proporcjonalnie do alokacji brutto dokumentu. */
export function defaultProportionalPaymentAllocationRows(
  docSlices: DocumentGrossSlice[],
  paymentGrossRaw: string,
): { projectId: string; grossAmount: string; description: string }[] {
  const g = normalizeDecimalInput(String(paymentGrossRaw).trim());
  const payNum = Number(g);
  if (!Number.isFinite(payNum) || docSlices.length === 0) return [];
  const dist = distributePaymentGrossForReporting(payNum, null, docSlices);
  return Array.from(dist.entries()).map(([projectId, amount]) => ({
    projectId,
    grossAmount: amount.toFixed(2),
    description: "",
  }));
}
