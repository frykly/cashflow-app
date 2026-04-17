import type { IncomeInvoice, IncomeInvoicePayment } from "@prisma/client";
import { documentGrossSlicesFromInvoice } from "@/lib/payment-project-allocation/distribute-read";
import {
  incomeInvoiceCashTargets,
  PAY_EPS,
  sumIncomePaymentsMainVat,
} from "@/lib/cashflow/settlement";
import { round2 } from "@/lib/cashflow/money";

type PaySlice = Pick<
  IncomeInvoicePayment,
  "amountGross" | "allocatedMainAmount" | "allocatedVatAmount"
>;

function invoiceHasMultiProjectSlices(inv: {
  projectAllocations?: { projectId: string; grossAmount: unknown }[];
  grossAmount: unknown;
  projectId: string | null;
}): boolean {
  return documentGrossSlicesFromInvoice({
    projectAllocations: inv.projectAllocations ?? [],
    grossAmount: inv.grossAmount,
    projectId: inv.projectId,
  }).length > 1;
}

/**
 * Walidacja jawnego podziału MAIN/VAT dla wpłaty przychodu.
 * @returns komunikat błędu albo null gdy OK
 */
export function validateIncomeManualSplit(
  inv: IncomeInvoice,
  amountGross: number,
  mainAlloc: number,
  vatAlloc: number,
  /** Wpłaty już zapisane (bez bieżącej, przy edycji wyklucz id). */
  existingOtherPayments: PaySlice[],
): string | null {
  if (inv.vatDestination !== "VAT") {
    return "Ręczny podział MAIN/VAT jest dostępny tylko przy fakturze z rozdzielczością VAT (pole VAT).";
  }
  if (invoiceHasMultiProjectSlices(inv)) {
    return "Przy fakturze z wieloma projektami użyj proporcjonalnego podziału (bez jawnego MAIN/VAT na wpłacie).";
  }
  if (Math.abs(mainAlloc + vatAlloc - amountGross) > PAY_EPS) {
    return "Suma MAIN + VAT musi równać się kwocie brutto wpłaty.";
  }
  if (mainAlloc < -PAY_EPS || vatAlloc < -PAY_EPS) {
    return "Kwoty MAIN i VAT nie mogą być ujemne.";
  }
  const targets = incomeInvoiceCashTargets(inv);
  const sum = sumIncomePaymentsMainVat(inv, existingOtherPayments);
  if (round2(sum.main + mainAlloc) > round2(targets.main) + PAY_EPS) {
    return "Łączna część MAIN przekroczyłaby netto faktury.";
  }
  if (round2(sum.vat + vatAlloc) > round2(targets.vat) + PAY_EPS) {
    return "Łączna część VAT przekroczyłaby VAT z faktury.";
  }
  return null;
}
