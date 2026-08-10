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
    message: "Nieprawidłowa data",
  }),
);

function optionalIsoNullable() {
  return z.preprocess(
    (v: unknown) => {
      if (v === "" || v === null || v === undefined) return null;
      return normalizeDateInput(v);
    },
    z.union([isoDateTime, z.null()]).optional(),
  );
}

const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().nullable().optional(),
);

const vatRateField = z.preprocess((v: unknown) => {
  if (v === "" || v === undefined || v === null) return 23;
  const n = Number(v);
  if (n === 0 || n === 5 || n === 8 || n === 23) return n;
  return 23;
}, z.union([z.literal(0), z.literal(5), z.literal(8), z.literal(23)]));

const decimalLike = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "number" ? String(v) : normalizeDecimalInput(String(v).trim())));

const projectAllocationRowSchema = z.object({
  projectId: z.string().min(1),
  netAmount: z.union([z.number(), z.string()]),
  grossAmount: z.union([z.number(), z.string()]),
  description: z.string().max(500).optional().default(""),
});

/** Full form overrides for KSeF cost import (same fields as cost invoice create). */
export const ksefImportCostBodySchema = z.object({
  documentNumber: z.string().min(1).optional(),
  supplier: z.string().min(1).optional(),
  description: z.string().optional(),
  vatRate: vatRateField.optional(),
  vatOnly: z.boolean().optional(),
  netAmount: decimalLike.optional(),
  vatAmount: z.union([z.number(), z.string()]).optional(),
  grossAmount: z.union([z.number(), z.string()]).optional(),
  amountToPayGross: z.union([z.number(), z.string(), z.null()]).optional(),
  documentDate: isoDateTime.optional(),
  paymentDueDate: isoDateTime.optional(),
  plannedPaymentDate: isoDateTime.optional(),
  status: z.enum(["PLANOWANA", "DO_ZAPLATY", "PARTIALLY_PAID", "ZAPLACONA"]).optional(),
  paid: z.boolean().optional(),
  actualPaymentDate: optionalIsoNullable(),
  paymentSource: z.enum(["MAIN", "VAT", "VAT_THEN_MAIN", "CASH"]).optional(),
  notes: z.string().optional(),
  projectId: optionalId,
  expenseCategoryId: optionalId,
  costPlaceKind: z.enum(["UNCLASSIFIED", "PROJECT", "GENERAL_502", "MANAGEMENT_550"]).optional(),
  accountingNote: z.string().optional(),
  vehicleId: optionalId,
  projectAllocations: z.array(projectAllocationRowSchema).optional(),
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
