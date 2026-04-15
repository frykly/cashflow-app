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

export const appSettingsSchema = z.object({
  mainOpeningBalance: decimalLike,
  vatOpeningBalance: decimalLike,
  effectiveFrom: isoDateTime,
});

const invoiceProjectAllocationRowSchema = z.object({
  projectId: z.string().min(1),
  netAmount: decimalLike,
  grossAmount: decimalLike,
  description: z.string().max(500).optional().default(""),
});

const plannedProjectAllocationRowSchema = z.object({
  projectId: z.string().min(1),
  amount: decimalLike,
  amountVat: decimalLike.optional().default("0"),
  description: z.string().max(500).optional().default(""),
});

export const incomeInvoiceCreateSchema = z
  .object({
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
    projectId: optionalId,
    /** Po utworzeniu faktury — oznacza zdarzenie planowane jako CONVERTED (tylko PLANNED + typ INCOME). */
    sourcePlannedEventId: optionalId,
    notes: z.string().optional().default(""),
  })
  .extend({
    projectAllocations: z.array(invoiceProjectAllocationRowSchema).optional(),
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
  projectId: optionalId,
  /** Po utworzeniu faktury — oznacza zdarzenie planowane jako CONVERTED (tylko PLANNED + typ EXPENSE). */
  sourcePlannedEventId: optionalId,
  notes: z.string().optional().default(""),
})
  .extend({
    projectAllocations: z.array(invoiceProjectAllocationRowSchema).optional(),
  });

export const costInvoiceUpdateSchema = costInvoiceCreateSchema.partial().extend({
  isRecurringDetached: z.boolean().optional(),
});

export const plannedEventCreateSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"]),
    title: z.string().min(1),
    description: z.string().optional().default(""),
    amount: decimalLike,
    amountVat: decimalLike.optional(),
    plannedDate: isoDateTime,
    status: z.enum(["PLANNED", "DONE", "CANCELLED"]),
    incomeCategoryId: optionalId,
    expenseCategoryId: optionalId,
    projectId: optionalId,
    notes: z.string().optional().default(""),
  })
  .extend({
    projectAllocations: z.array(plannedProjectAllocationRowSchema).optional(),
  });

export const plannedEventUpdateSchema = plannedEventCreateSchema.partial();

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : String(v).trim()),
    z.union([z.string().max(max), z.null()]).optional(),
  );

const projectLifecycleEnum = z.enum(["NEW", "IN_PROGRESS", "FOR_HANDOFF", "COMPLETED"]);
const projectSettlementEnum = z.enum([
  "NONE",
  "TO_SETTLE",
  "WAITING_FOR_SETTLEMENT",
  "DPW_TODO",
  "SETTLED",
  "SETTLED_WITH_GAPS",
  "SETTLED_BLOCKED",
]);

const optionalLifecycleStatus = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.union([projectLifecycleEnum, z.null()]).optional(),
);

const optionalSettlementStatus = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.union([projectSettlementEnum, z.null()]).optional(),
);

const optionalPlannedDecimal = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.union([decimalLike, z.null()]).optional(),
);

export const projectCreateSchema = z.object({
  name: z.string().min(1).max(500),
  code: optionalTrimmed(100),
  clientName: optionalTrimmed(500),
  description: optionalTrimmed(5000),
  isActive: z.boolean().optional().default(true),
  lifecycleStatus: optionalLifecycleStatus,
  settlementStatus: optionalSettlementStatus,
  plannedRevenueNet: optionalPlannedDecimal,
  plannedCostNet: optionalPlannedDecimal,
  startDate: optionalIsoNullable(),
  endDate: optionalIsoNullable(),
});

export const projectUpdateSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  code: optionalTrimmed(100),
  clientName: optionalTrimmed(500),
  description: optionalTrimmed(5000),
  isActive: z.boolean().optional(),
  lifecycleStatus: optionalLifecycleStatus,
  settlementStatus: optionalSettlementStatus,
  plannedRevenueNet: optionalPlannedDecimal,
  plannedCostNet: optionalPlannedDecimal,
  startDate: optionalIsoNullable(),
  endDate: optionalIsoNullable(),
});

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
