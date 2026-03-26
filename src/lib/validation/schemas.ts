import { z } from "zod";
import { normalizeDecimalInput } from "@/lib/decimal-input";

function normalizeDateInput(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T12:00:00.000Z`;
  return t;
}

const isoDateTime = z.preprocess(
  normalizeDateInput,
  z.string().refine((s) => s.trim() !== "" && !Number.isNaN(Date.parse(s)), {
    message: "Nieprawidłowa data (ISO)",
  }),
);

/** Puste stringi z formularzy → null (opcjonalne pola daty). */
function optionalIsoNullable() {
  return z.preprocess(
    (v: unknown) => {
      if (v === "" || v === null || v === undefined) return null;
      return normalizeDateInput(v);
    },
    z.union([isoDateTime, z.null()]).optional(),
  );
}

const vatRateField = z.preprocess((v: unknown) => {
  if (v === "" || v === undefined || v === null) return 23;
  const n = Number(v);
  if (n === 0 || n === 8 || n === 23) return n;
  return 23;
}, z.union([z.literal(0), z.literal(8), z.literal(23)]));

const decimalLike = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? String(v) : normalizeDecimalInput(String(v).trim())))
  .refine((s) => s !== "" && !Number.isNaN(Number(s)) && Number.isFinite(Number(s)), {
    message: "Nieprawidłowa wartość liczbowa",
  });

const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().nullable().optional(),
);

/** Dowolna etykieta projektu (bez osobnego modelu); puste → null. */
const optionalProjectName = z.preprocess(
  (v) => {
    if (v === "" || v === null || v === undefined) return null;
    const s = String(v).trim();
    return s === "" ? null : s.slice(0, 500);
  },
  z.union([z.string().max(500), z.null()]).optional(),
);

export const appSettingsSchema = z.object({
  mainOpeningBalance: decimalLike,
  vatOpeningBalance: decimalLike,
  effectiveFrom: isoDateTime,
});

export const incomeInvoiceCreateSchema = z.object({
  invoiceNumber: z.string().min(1),
  contractor: z.string().min(1),
  description: z.string().optional().default(""),
  vatRate: vatRateField.optional().default(23),
  netAmount: decimalLike,
  issueDate: isoDateTime,
  paymentDueDate: isoDateTime,
  plannedIncomeDate: isoDateTime,
  status: z.enum(["PLANOWANA", "WYSTAWIONA", "PARTIALLY_RECEIVED", "OPLACONA"]),
  vatDestination: z.enum(["MAIN", "VAT"]),
  confirmedIncome: z.boolean().optional().default(false),
  actualIncomeDate: optionalIsoNullable(),
  incomeCategoryId: optionalId,
  projectName: optionalProjectName,
  notes: z.string().optional().default(""),
});

export const incomeInvoiceUpdateSchema = incomeInvoiceCreateSchema.partial().extend({
  isRecurringDetached: z.boolean().optional(),
});

export const costInvoiceCreateSchema = z.object({
  documentNumber: z.string().min(1),
  supplier: z.string().min(1),
  description: z.string().optional().default(""),
  vatRate: vatRateField.optional().default(23),
  netAmount: decimalLike,
  /** Tryb „tylko VAT”: netto 0, brutto = kwota VAT (np. płatność z konta VAT). */
  vatOnly: z.boolean().optional().default(false),
  vatAmount: z.union([z.number(), z.string()]).optional(),
  grossAmount: z.union([z.number(), z.string()]).optional(),
  documentDate: isoDateTime,
  paymentDueDate: isoDateTime,
  plannedPaymentDate: isoDateTime,
  status: z.enum(["PLANOWANA", "DO_ZAPLATY", "PARTIALLY_PAID", "ZAPLACONA"]),
  paid: z.boolean().optional().default(false),
  actualPaymentDate: optionalIsoNullable(),
  paymentSource: z.enum(["MAIN", "VAT", "VAT_THEN_MAIN"]),
  expenseCategoryId: optionalId,
  projectName: optionalProjectName,
  notes: z.string().optional().default(""),
});

export const costInvoiceUpdateSchema = costInvoiceCreateSchema.partial().extend({
  isRecurringDetached: z.boolean().optional(),
});

export const plannedEventCreateSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  amount: decimalLike,
  amountVat: decimalLike.optional(),
  plannedDate: isoDateTime,
  status: z.enum(["PLANNED", "DONE", "CANCELLED"]),
  incomeCategoryId: optionalId,
  expenseCategoryId: optionalId,
  projectName: optionalProjectName,
  notes: z.string().optional().default(""),
});

export const plannedEventUpdateSchema = plannedEventCreateSchema.partial();

export const incomePaymentCreateSchema = z.object({
  amountGross: decimalLike,
  paymentDate: isoDateTime,
  notes: z.string().optional().default(""),
});

export const costPaymentCreateSchema = z.object({
  amountGross: decimalLike,
  paymentDate: isoDateTime,
  notes: z.string().optional().default(""),
});

const optionalAmountVatRecurring = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : normalizeDecimalInput(String(v))),
  z.union([z.string(), z.null()]).optional(),
);

export const recurringTemplateCreateSchema = z.object({
  title: z.string().min(1),
  type: z.enum(["INCOME", "EXPENSE"]),
  accountMode: z.enum(["MAIN", "VAT", "SPLIT"]).optional().default("MAIN"),
  amount: decimalLike,
  amountVat: optionalAmountVatRecurring,
  incomeCategoryId: optionalId,
  expenseCategoryId: optionalId,
  frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  startDate: isoDateTime,
  endDate: optionalIsoNullable(),
  dayOfMonth: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(1).max(31).nullable().optional(),
  ),
  weekday: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(6).nullable().optional(),
  ),
  notes: z.string().optional().default(""),
  isActive: z.boolean().optional().default(true),
});

export const recurringTemplateUpdateSchema = recurringTemplateCreateSchema.partial();
