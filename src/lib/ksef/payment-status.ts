import type { KsefDocument } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";
import {
  costRemainingGross,
  incomeRemainingGross,
  sumCostPaymentsGross,
  sumIncomePaymentsGross,
} from "@/lib/cashflow/settlement";

export const KSEF_PAYMENT_EPS = 0.02;

export type KsefPaymentStatus =
  | "NO_INVOICE"
  | "NOT_APPLICABLE"
  | "DUE"
  | "AWAITING"
  | "PARTIAL"
  | "PAID"
  | "OVERDUE";

export const KSEF_PAYMENT_STATUS_LABELS: Record<KsefPaymentStatus, string> = {
  NO_INVOICE: "Brak faktury w systemie",
  NOT_APPLICABLE: "Nie dotyczy",
  DUE: "Do zapłaty",
  AWAITING: "Oczekuje na wpłatę",
  PARTIAL: "Częściowo opłacona",
  PAID: "Opłacona",
  OVERDUE: "Po terminie",
};

type PaymentPick = { amountGross: Decimal };

type CostInvoiceForStatus = {
  id: string;
  grossAmount: Decimal;
  paymentDueDate: Date;
  payments: PaymentPick[];
};

type IncomeInvoiceForStatus = {
  id: string;
  grossAmount: Decimal;
  paymentDueDate: Date;
  payments: PaymentPick[];
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function isPastDue(paymentDueDate: Date | null | undefined): boolean {
  if (!paymentDueDate) return false;
  const due = new Date(paymentDueDate);
  due.setHours(0, 0, 0, 0);
  return due < startOfToday();
}

export function resolveLinkedInvoiceIds(doc: Pick<
  KsefDocument,
  | "importedAsCostInvoiceId"
  | "importedAsRevenueInvoiceId"
  | "duplicateOfCostInvoiceId"
  | "duplicateOfIncomeInvoiceId"
>): { costId: string | null; incomeId: string | null } {
  return {
    costId: doc.importedAsCostInvoiceId ?? doc.duplicateOfCostInvoiceId,
    incomeId: doc.importedAsRevenueInvoiceId ?? doc.duplicateOfIncomeInvoiceId,
  };
}

export function contractorNameForDocument(doc: Pick<
  KsefDocument,
  "documentDirection" | "sellerName" | "buyerName"
>): string {
  if (doc.documentDirection === "SALE") return doc.buyerName || "—";
  if (doc.documentDirection === "PURCHASE") return doc.sellerName || "—";
  return doc.sellerName || doc.buyerName || "—";
}

function computeCostPaymentStatus(inv: CostInvoiceForStatus): KsefPaymentStatus {
  const paidSum = sumCostPaymentsGross(inv.payments);
  const rem = costRemainingGross({ grossAmount: inv.grossAmount }, inv.payments);
  if (rem <= KSEF_PAYMENT_EPS) return "PAID";
  if (paidSum > KSEF_PAYMENT_EPS) return "PARTIAL";
  if (isPastDue(inv.paymentDueDate)) return "OVERDUE";
  return "DUE";
}

function computeIncomePaymentStatus(inv: IncomeInvoiceForStatus): KsefPaymentStatus {
  const paidSum = sumIncomePaymentsGross(inv.payments);
  const rem = incomeRemainingGross({ grossAmount: inv.grossAmount }, inv.payments);
  if (rem <= KSEF_PAYMENT_EPS) return "PAID";
  if (paidSum > KSEF_PAYMENT_EPS) return "PARTIAL";
  if (isPastDue(inv.paymentDueDate)) return "OVERDUE";
  return "AWAITING";
}

export function computeKsefPaymentStatus(
  workflowStatus: string,
  costInvoice: CostInvoiceForStatus | null | undefined,
  incomeInvoice: IncomeInvoiceForStatus | null | undefined,
): { paymentStatus: KsefPaymentStatus; paymentStatusLabel: string } {
  if (workflowStatus === "REJECTED") {
    return { paymentStatus: "NOT_APPLICABLE", paymentStatusLabel: KSEF_PAYMENT_STATUS_LABELS.NOT_APPLICABLE };
  }
  if (costInvoice) {
    const paymentStatus = computeCostPaymentStatus(costInvoice);
    return { paymentStatus, paymentStatusLabel: KSEF_PAYMENT_STATUS_LABELS[paymentStatus] };
  }
  if (incomeInvoice) {
    const paymentStatus = computeIncomePaymentStatus(incomeInvoice);
    return { paymentStatus, paymentStatusLabel: KSEF_PAYMENT_STATUS_LABELS[paymentStatus] };
  }
  return { paymentStatus: "NO_INVOICE", paymentStatusLabel: KSEF_PAYMENT_STATUS_LABELS.NO_INVOICE };
}

export async function loadInvoiceMapsForPaymentStatus(costIds: string[], incomeIds: string[]) {
  const { prisma } = await import("@/lib/db");
  const [costs, incomes] = await Promise.all([
    costIds.length > 0
      ? prisma.costInvoice.findMany({
          where: { id: { in: costIds } },
          select: {
            id: true,
            grossAmount: true,
            paymentDueDate: true,
            payments: { select: { amountGross: true } },
          },
        })
      : Promise.resolve([]),
    incomeIds.length > 0
      ? prisma.incomeInvoice.findMany({
          where: { id: { in: incomeIds } },
          select: {
            id: true,
            grossAmount: true,
            paymentDueDate: true,
            payments: { select: { amountGross: true } },
          },
        })
      : Promise.resolve([]),
  ]);
  return {
    costById: new Map(costs.map((c) => [c.id, c])),
    incomeById: new Map(incomes.map((i) => [i.id, i])),
  };
}

export function paymentFieldsForDocument(
  doc: KsefDocument,
  costById: Map<string, CostInvoiceForStatus>,
  incomeById: Map<string, IncomeInvoiceForStatus>,
) {
  const { costId, incomeId } = resolveLinkedInvoiceIds(doc);
  const { paymentStatus, paymentStatusLabel } = computeKsefPaymentStatus(
    doc.workflowStatus,
    costId ? costById.get(costId) : null,
    incomeId ? incomeById.get(incomeId) : null,
  );
  return {
    contractorName: contractorNameForDocument(doc),
    linkedCostInvoiceId: costId,
    linkedIncomeInvoiceId: incomeId,
    paymentStatus,
    paymentStatusLabel,
  };
}
