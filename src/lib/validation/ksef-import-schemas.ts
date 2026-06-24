import { z } from "zod";

function normalizeDateInput(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T12:00:00.000Z`;
  return t;
}

const isoDateTime = z.preprocess(
  normalizeDateInput,
  z.string().refine((s) => s.trim() !== "" && !Number.isNaN(Date.parse(s)), {
    message: "Nieprawidłowa data",
  }),
);

const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().nullable().optional(),
);

export const ksefImportCostBodySchema = z.object({
  projectId: optionalId,
  expenseCategoryId: optionalId,
  status: z.enum(["PLANOWANA", "DO_ZAPLATY", "PARTIALLY_PAID", "ZAPLACONA"]).optional(),
  paymentSource: z.enum(["MAIN", "VAT", "VAT_THEN_MAIN"]).optional(),
  plannedPaymentDate: isoDateTime.optional(),
  notes: z.string().optional(),
});

export const ksefImportRevenueBodySchema = z.object({
  projectId: optionalId,
  incomeCategoryId: optionalId,
  status: z.enum(["PLANOWANA", "WYSTAWIONA", "PARTIALLY_RECEIVED", "OPLACONA"]).optional(),
  vatDestination: z.enum(["MAIN", "VAT"]).optional(),
  plannedIncomeDate: isoDateTime.optional(),
  notes: z.string().optional(),
});

export type KsefImportCostBody = z.infer<typeof ksefImportCostBodySchema>;
export type KsefImportRevenueBody = z.infer<typeof ksefImportRevenueBodySchema>;
