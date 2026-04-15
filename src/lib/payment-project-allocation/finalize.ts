import type { Prisma } from "@prisma/client";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { documentGrossSlicesFromInvoice } from "@/lib/payment-project-allocation/distribute-read";
import { defaultProportionalPaymentAllocationRows } from "@/lib/payment-project-allocation/default-rows";
import { replaceCostPaymentProjectAllocations, replaceIncomePaymentProjectAllocations } from "@/lib/payment-project-allocation/persist";
import type { PaymentProjectAllocInput } from "@/lib/payment-project-allocation/persist";
import { validatePaymentProjectAllocationGrossSum } from "@/lib/payment-project-allocation/validate";

function normGross(s: string): string {
  return normalizeDecimalInput(String(s).trim());
}

/**
 * Po utworzeniu płatności kosztowej: brak wierszy przy 1 projekcie; przy wielu — proporcjonalnie lub jawne wiersze.
 */
export async function finalizeNewCostPaymentAllocations(
  tx: Prisma.TransactionClient,
  costInvoiceId: string,
  costInvoicePaymentId: string,
  paymentGross: string,
  explicit?: PaymentProjectAllocInput[] | null,
): Promise<void> {
  const inv = await tx.costInvoice.findUnique({
    where: { id: costInvoiceId },
    include: { projectAllocations: true },
  });
  if (!inv) return;
  const slices = documentGrossSlicesFromInvoice(inv);
  const g = normGross(paymentGross);
  if (slices.length <= 1) {
    await replaceCostPaymentProjectAllocations(tx, costInvoicePaymentId, []);
    return;
  }
  let rows: PaymentProjectAllocInput[];
  if (explicit && explicit.length > 0) {
    const err = validatePaymentProjectAllocationGrossSum(explicit, g);
    if (err) throw new Error(`PAY_ALLOC_VALIDATION:${err}`);
    rows = explicit.map((r) => ({
      projectId: r.projectId,
      grossAmount: normGross(r.grossAmount),
      description: r.description,
    }));
  } else {
    rows = defaultProportionalPaymentAllocationRows(slices, g);
  }
  await replaceCostPaymentProjectAllocations(tx, costInvoicePaymentId, rows);
}

export async function finalizeNewIncomePaymentAllocations(
  tx: Prisma.TransactionClient,
  incomeInvoiceId: string,
  incomeInvoicePaymentId: string,
  paymentGross: string,
  explicit?: PaymentProjectAllocInput[] | null,
): Promise<void> {
  const inv = await tx.incomeInvoice.findUnique({
    where: { id: incomeInvoiceId },
    include: { projectAllocations: true },
  });
  if (!inv) return;
  const slices = documentGrossSlicesFromInvoice(inv);
  const g = normGross(paymentGross);
  if (slices.length <= 1) {
    await replaceIncomePaymentProjectAllocations(tx, incomeInvoicePaymentId, []);
    return;
  }
  let rows: PaymentProjectAllocInput[];
  if (explicit && explicit.length > 0) {
    const err = validatePaymentProjectAllocationGrossSum(explicit, g);
    if (err) throw new Error(`PAY_ALLOC_VALIDATION:${err}`);
    rows = explicit.map((r) => ({
      projectId: r.projectId,
      grossAmount: normGross(r.grossAmount),
      description: r.description,
    }));
  } else {
    rows = defaultProportionalPaymentAllocationRows(slices, g);
  }
  await replaceIncomePaymentProjectAllocations(tx, incomeInvoicePaymentId, rows);
}
