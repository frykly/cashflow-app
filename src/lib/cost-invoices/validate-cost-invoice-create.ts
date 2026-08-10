import type { PrismaClient } from "@prisma/client";
import { resolveLegacyProjectFieldsFromAllocations } from "@/lib/project-allocations/persist";
import { validateCostOrIncomeAllocationSums } from "@/lib/project-allocations/validate";
import {
  resolveCostInvoiceAmounts,
  type ResolvedCostAmounts,
} from "@/lib/validation/cost-invoice-amounts";
import type { VatRatePct } from "@/lib/vat-rate";
import type { CostInvoiceCreateParsed } from "@/lib/cost-invoices/create-cost-invoice-core";

export type PreparedCostInvoiceCreate = {
  data: CostInvoiceCreateParsed;
  amounts: ResolvedCostAmounts;
};

export async function prepareCostInvoiceCreate(
  db: PrismaClient,
  data: CostInvoiceCreateParsed,
): Promise<{ ok: true; prepared: PreparedCostInvoiceCreate } | { ok: false; message: string }> {
  const resolved = resolveCostInvoiceAmounts({
    vatOnly: data.vatOnly ?? false,
    netAmount: data.netAmount,
    vatAmount: data.vatAmount,
    grossAmount: data.grossAmount,
    vatRate: data.vatRate as VatRatePct,
  });
  if (!resolved.ok) return { ok: false, message: resolved.message };

  const allocs = data.projectAllocations;
  if (allocs?.length) {
    const err = validateCostOrIncomeAllocationSums(
      allocs,
      resolved.amounts.net.toString(),
      resolved.amounts.gross.toString(),
    );
    if (err) return { ok: false, message: err };
  }

  try {
    await resolveLegacyProjectFieldsFromAllocations(db, data.projectId, allocs);
  } catch {
    return { ok: false, message: "Nieprawidłowy projekt" };
  }

  if (data.vehicleId) {
    const v = await db.vehicle.findUnique({ where: { id: data.vehicleId } });
    if (!v) return { ok: false, message: "Nieprawidłowy pojazd" };
  }

  return { ok: true, prepared: { data, amounts: resolved.amounts } };
}
