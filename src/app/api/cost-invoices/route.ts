import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { resolveCostInvoiceAmounts } from "@/lib/validation/cost-invoice-amounts";
import { costInvoiceCreateSchema } from "@/lib/validation/schemas";
import { buildCostWhere } from "@/lib/prisma-list-filters";
import type { VatRatePct } from "@/lib/vat-rate";
import { ensureClosingCostPaymentIfFullySettled } from "@/lib/cashflow/invoice-auto-settlement";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { finalizePlannedToCostConversion } from "@/lib/planned-event-conversion";
import { replaceCostInvoiceAllocations, resolveLegacyProjectFieldsFromAllocations } from "@/lib/project-allocations/persist";
import { validateCostOrIncomeAllocationSums } from "@/lib/project-allocations/validate";
import { ZodError } from "zod";

const sortable = new Set([
  "plannedPaymentDate",
  "documentDate",
  "createdAt",
  "paymentDueDate",
  "documentNumber",
  "supplier",
  "netAmount",
  "grossAmount",
  "status",
]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = sortable.has(searchParams.get("sort") ?? "")
    ? (searchParams.get("sort") as
        | "plannedPaymentDate"
        | "documentDate"
        | "createdAt"
        | "paymentDueDate"
        | "documentNumber"
        | "supplier"
        | "netAmount"
        | "grossAmount"
        | "status")
    : "plannedPaymentDate";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  const where = buildCostWhere(searchParams);

  const rows = await prisma.costInvoice.findMany({
    where,
    orderBy: { [sort]: order },
    include: {
      expenseCategory: true,
      project: true,
      payments: {
        orderBy: { paymentDate: "asc" },
        include: { projectAllocations: { include: { project: { select: { id: true, name: true } } } } },
      },
      projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
    },
  });
  return jsonData(rows);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = costInvoiceCreateSchema.parse(body);
    const resolved = resolveCostInvoiceAmounts({
      vatOnly: data.vatOnly,
      netAmount: data.netAmount,
      vatAmount: data.vatAmount,
      grossAmount: data.grossAmount,
      vatRate: data.vatRate as VatRatePct,
    });
    if (!resolved.ok) return jsonError(resolved.message);
    const { net, vat, gross, storedVatRate } = resolved.amounts;
    const allocs = data.projectAllocations;
    if (allocs?.length) {
      const err = validateCostOrIncomeAllocationSums(allocs, net.toString(), gross.toString());
      if (err) return jsonError(err, 400);
    }
    let pf: { projectId: string | null; projectName: string | null };
    try {
      pf = await resolveLegacyProjectFieldsFromAllocations(prisma, data.projectId, allocs);
    } catch {
      return jsonError("Nieprawidłowy projekt", 400);
    }
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.costInvoice.create({
        data: {
          documentNumber: data.documentNumber,
          supplier: data.supplier,
          description: data.description ?? "",
          vatRate: storedVatRate,
          netAmount: net,
          vatAmount: vat,
          grossAmount: gross,
          documentDate: new Date(data.documentDate),
          paymentDueDate: new Date(data.paymentDueDate),
          plannedPaymentDate: new Date(data.plannedPaymentDate),
          status: data.status,
          paid: data.paid ?? false,
          actualPaymentDate: data.actualPaymentDate ? new Date(data.actualPaymentDate) : null,
          paymentSource: data.paymentSource,
          notes: data.notes ?? "",
          projectId: pf.projectId,
          projectName: pf.projectName,
          expenseCategoryId: data.expenseCategoryId ?? null,
        },
        include: { expenseCategory: true, project: true, payments: true },
      });
      await replaceCostInvoiceAllocations(tx, created.id, allocs ?? []);
      if (data.sourcePlannedEventId) {
        try {
          await finalizePlannedToCostConversion(tx, data.sourcePlannedEventId, created.id);
        } catch (e) {
          const code = e instanceof Error ? e.message : "";
          if (code === "PLANNED_NOT_FOUND") throw new Error("INVALID_PLANNED_EVENT");
          if (code === "PLANNED_TYPE_MISMATCH") throw new Error("PLANNED_TYPE_MISMATCH");
          if (code === "PLANNED_NOT_ACTIVE") throw new Error("PLANNED_NOT_ACTIVE");
          if (code === "PLANNED_ALREADY_CONVERTED") throw new Error("PLANNED_ALREADY_CONVERTED");
          throw e;
        }
      }
      return created;
    });
    await ensureClosingCostPaymentIfFullySettled(row.id);
    await syncCostInvoiceStatus(row.id);
    const fresh = await prisma.costInvoice.findUnique({
      where: { id: row.id },
      include: {
        expenseCategory: true,
        project: true,
        payments: {
        orderBy: { paymentDate: "asc" },
        include: { projectAllocations: { include: { project: { select: { id: true, name: true } } } } },
      },
        projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
      },
    });
    return jsonData(fresh ?? row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    if (e instanceof Error) {
      if (e.message === "INVALID_PLANNED_EVENT") return jsonError("Nie znaleziono zdarzenia planowanego.", 400);
      if (e.message === "PLANNED_TYPE_MISMATCH") return jsonError("Zdarzenie nie jest typu wydatek.", 400);
      if (e.message === "PLANNED_NOT_ACTIVE") return jsonError("Zdarzenie nie jest aktywne (tylko „Zaplanowane”).", 400);
      if (e.message === "PLANNED_ALREADY_CONVERTED") return jsonError("Zdarzenie zostało już skonwertowane.", 409);
    }
    throw e;
  }
}
