import type { Prisma, RecurringTemplate } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { format, startOfDay } from "date-fns";
import { inferVatRateFromAmounts } from "@/lib/vat-rate";
import { decToNumber } from "@/lib/cashflow/money";
import { plannedAmountsFromRecurringTemplate } from "@/lib/cashflow/recurring-planned-amounts";

/** Unikalny numer dokumentu dla wystąpienia reguły (jeden na szablon + dzień kalendarzowy). */
export function recurringInvoiceDocumentNumber(templateId: string, occurrenceDate: Date): string {
  const d = startOfDay(occurrenceDate);
  const compact = templateId.replace(/-/g, "");
  const prefix = compact.slice(0, 10);
  return `CYK-${prefix}-${format(d, "yyyyMMdd")}`;
}

function baseNotes(tmpl: RecurringTemplate): string {
  return tmpl.notes?.trim() ? `Reguła cykliczna: ${tmpl.notes.trim()}` : "";
}

export function buildRecurringCostUncheckedCreate(
  tmpl: RecurringTemplate,
  occurrenceDate: Date,
): Prisma.CostInvoiceUncheckedCreateInput {
  const occ = startOfDay(occurrenceDate);
  const mode = tmpl.accountMode ?? "MAIN";
  const { amount: mainD, amountVat: vatD } = plannedAmountsFromRecurringTemplate(tmpl);
  const doc = recurringInvoiceDocumentNumber(tmpl.id, occ);
  const notes = baseNotes(tmpl);

  if (mode === "MAIN") {
    return {
      documentNumber: doc,
      supplier: tmpl.title,
      description: "",
      vatRate: 0,
      netAmount: mainD,
      vatAmount: new Decimal(0),
      grossAmount: mainD,
      documentDate: occ,
      paymentDueDate: occ,
      plannedPaymentDate: occ,
      status: "PLANOWANA",
      paid: false,
      actualPaymentDate: null,
      paymentSource: "MAIN",
      notes,
      expenseCategoryId: tmpl.expenseCategoryId,
      sourceRecurringTemplateId: tmpl.id,
      generatedOccurrenceDate: occ,
      isGeneratedFromRecurring: true,
      isRecurringDetached: false,
    };
  }

  if (mode === "VAT") {
    return {
      documentNumber: doc,
      supplier: tmpl.title,
      description: "",
      vatRate: 23,
      netAmount: new Decimal(0),
      vatAmount: mainD,
      grossAmount: mainD,
      documentDate: occ,
      paymentDueDate: occ,
      plannedPaymentDate: occ,
      status: "PLANOWANA",
      paid: false,
      actualPaymentDate: null,
      paymentSource: "VAT",
      notes,
      expenseCategoryId: tmpl.expenseCategoryId,
      sourceRecurringTemplateId: tmpl.id,
      generatedOccurrenceDate: occ,
      isGeneratedFromRecurring: true,
      isRecurringDetached: false,
    };
  }

  const gross = mainD.plus(vatD);
  const rate = inferVatRateFromAmounts(decToNumber(mainD), decToNumber(vatD));
  return {
    documentNumber: doc,
    supplier: tmpl.title,
    description: "",
    vatRate: rate,
    netAmount: mainD,
    vatAmount: vatD,
    grossAmount: gross,
    documentDate: occ,
    paymentDueDate: occ,
    plannedPaymentDate: occ,
    status: "PLANOWANA",
    paid: false,
    actualPaymentDate: null,
    paymentSource: "VAT_THEN_MAIN",
    notes,
    expenseCategoryId: tmpl.expenseCategoryId,
    sourceRecurringTemplateId: tmpl.id,
    generatedOccurrenceDate: occ,
    isGeneratedFromRecurring: true,
    isRecurringDetached: false,
  };
}

export function buildRecurringIncomeUncheckedCreate(
  tmpl: RecurringTemplate,
  occurrenceDate: Date,
): Prisma.IncomeInvoiceUncheckedCreateInput {
  const occ = startOfDay(occurrenceDate);
  const mode = tmpl.accountMode ?? "MAIN";
  const { amount: mainD, amountVat: vatD } = plannedAmountsFromRecurringTemplate(tmpl);
  const invNum = recurringInvoiceDocumentNumber(tmpl.id, occ);
  const notes = baseNotes(tmpl);

  if (mode === "MAIN") {
    return {
      invoiceNumber: invNum,
      contractor: tmpl.title,
      description: "",
      vatRate: 0,
      netAmount: mainD,
      vatAmount: new Decimal(0),
      grossAmount: mainD,
      issueDate: occ,
      paymentDueDate: occ,
      plannedIncomeDate: occ,
      status: "PLANOWANA",
      vatDestination: "MAIN",
      confirmedIncome: false,
      actualIncomeDate: null,
      notes,
      incomeCategoryId: tmpl.incomeCategoryId,
      sourceRecurringTemplateId: tmpl.id,
      generatedOccurrenceDate: occ,
      isGeneratedFromRecurring: true,
      isRecurringDetached: false,
    };
  }

  if (mode === "VAT") {
    return {
      invoiceNumber: invNum,
      contractor: tmpl.title,
      description: "",
      vatRate: 23,
      netAmount: new Decimal(0),
      vatAmount: mainD,
      grossAmount: mainD,
      issueDate: occ,
      paymentDueDate: occ,
      plannedIncomeDate: occ,
      status: "PLANOWANA",
      vatDestination: "VAT",
      confirmedIncome: false,
      actualIncomeDate: null,
      notes,
      incomeCategoryId: tmpl.incomeCategoryId,
      sourceRecurringTemplateId: tmpl.id,
      generatedOccurrenceDate: occ,
      isGeneratedFromRecurring: true,
      isRecurringDetached: false,
    };
  }

  const gross = mainD.plus(vatD);
  const rate = inferVatRateFromAmounts(decToNumber(mainD), decToNumber(vatD));
  return {
    invoiceNumber: invNum,
    contractor: tmpl.title,
    description: "",
    vatRate: rate,
    netAmount: mainD,
    vatAmount: vatD,
    grossAmount: gross,
    issueDate: occ,
    paymentDueDate: occ,
    plannedIncomeDate: occ,
    status: "PLANOWANA",
    vatDestination: "VAT",
    confirmedIncome: false,
    actualIncomeDate: null,
    notes,
    incomeCategoryId: tmpl.incomeCategoryId,
    sourceRecurringTemplateId: tmpl.id,
    generatedOccurrenceDate: occ,
    isGeneratedFromRecurring: true,
    isRecurringDetached: false,
  };
}

/** Pola kwot / konta / kontrahenta — bez numeru dokumentu (numer zostaje powiązany z dniem wystąpienia). */
export function buildRecurringCostSyncPayload(tmpl: RecurringTemplate): Prisma.CostInvoiceUncheckedUpdateManyInput {
  const mode = tmpl.accountMode ?? "MAIN";
  const { amount: mainD, amountVat: vatD } = plannedAmountsFromRecurringTemplate(tmpl);
  const notes = baseNotes(tmpl);

  if (mode === "MAIN") {
    return {
      supplier: tmpl.title,
      vatRate: 0,
      netAmount: mainD,
      vatAmount: new Decimal(0),
      grossAmount: mainD,
      paymentSource: "MAIN",
      notes,
      expenseCategoryId: tmpl.expenseCategoryId,
    };
  }
  if (mode === "VAT") {
    return {
      supplier: tmpl.title,
      vatRate: 23,
      netAmount: new Decimal(0),
      vatAmount: mainD,
      grossAmount: mainD,
      paymentSource: "VAT",
      notes,
      expenseCategoryId: tmpl.expenseCategoryId,
    };
  }
  const gross = mainD.plus(vatD);
  const rate = inferVatRateFromAmounts(decToNumber(mainD), decToNumber(vatD));
  return {
    supplier: tmpl.title,
    vatRate: rate,
    netAmount: mainD,
    vatAmount: vatD,
    grossAmount: gross,
    paymentSource: "VAT_THEN_MAIN",
    notes,
    expenseCategoryId: tmpl.expenseCategoryId,
  };
}

export function buildRecurringIncomeSyncPayload(tmpl: RecurringTemplate): Prisma.IncomeInvoiceUncheckedUpdateManyInput {
  const mode = tmpl.accountMode ?? "MAIN";
  const { amount: mainD, amountVat: vatD } = plannedAmountsFromRecurringTemplate(tmpl);
  const notes = baseNotes(tmpl);

  if (mode === "MAIN") {
    return {
      contractor: tmpl.title,
      vatRate: 0,
      netAmount: mainD,
      vatAmount: new Decimal(0),
      grossAmount: mainD,
      vatDestination: "MAIN",
      notes,
      incomeCategoryId: tmpl.incomeCategoryId,
    };
  }
  if (mode === "VAT") {
    return {
      contractor: tmpl.title,
      vatRate: 23,
      netAmount: new Decimal(0),
      vatAmount: mainD,
      grossAmount: mainD,
      vatDestination: "VAT",
      notes,
      incomeCategoryId: tmpl.incomeCategoryId,
    };
  }
  const gross = mainD.plus(vatD);
  const rate = inferVatRateFromAmounts(decToNumber(mainD), decToNumber(vatD));
  return {
    contractor: tmpl.title,
    vatRate: rate,
    netAmount: mainD,
    vatAmount: vatD,
    grossAmount: gross,
    vatDestination: "VAT",
    notes,
    incomeCategoryId: tmpl.incomeCategoryId,
  };
}
