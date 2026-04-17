import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { grossFromNetAndRate, vatFromNetAndRate } from "@/lib/validation/gross";
import { incomeInvoiceCreateSchema } from "@/lib/validation/schemas";
import { buildIncomeWhere } from "@/lib/prisma-list-filters";
import { ensureClosingIncomePaymentIfFullySettled } from "@/lib/cashflow/invoice-auto-settlement";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import { finalizePlannedToIncomeConversion } from "@/lib/planned-event-conversion";
import { replaceIncomeInvoiceAllocations, resolveLegacyProjectFieldsFromAllocations } from "@/lib/project-allocations/persist";
import { validateCostOrIncomeAllocationSums } from "@/lib/project-allocations/validate";
import { ZodError } from "zod";

const sortable = new Set([
  "plannedIncomeDate",
  "issueDate",
  "createdAt",
  "paymentDueDate",
  "invoiceNumber",
  "contractor",
  "netAmount",
  "grossAmount",
  "status",
]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = sortable.has(searchParams.get("sort") ?? "")
    ? (searchParams.get("sort") as
        | "plannedIncomeDate"
        | "issueDate"
        | "createdAt"
        | "paymentDueDate"
        | "invoiceNumber"
        | "contractor"
        | "netAmount"
        | "grossAmount"
        | "status")
    : "plannedIncomeDate";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  const where = buildIncomeWhere(searchParams);

  const rows = await prisma.incomeInvoice.findMany({
    where,
    orderBy: { [sort]: order },
    include: {
      incomeCategory: true,
      project: true,
      payments: {
        orderBy: { paymentDate: "asc" },
        include: { projectAllocations: { include: { project: { select: { id: true, name: true } } } } },
      },
      projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
      plannedPayments: { orderBy: { sortOrder: "asc" } },
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
    const data = incomeInvoiceCreateSchema.parse(body);
    const rate = data.vatRate;
    const vat = vatFromNetAndRate(data.netAmount, rate);
    const gross = grossFromNetAndRate(data.netAmount, rate);
    const allocs = data.projectAllocations;
    if (allocs?.length) {
      const err = validateCostOrIncomeAllocationSums(allocs, String(data.netAmount), gross.toString());
      if (err) return jsonError(err, 400);
    }
    let pf: { projectId: string | null; projectName: string | null };
    try {
      pf = await resolveLegacyProjectFieldsFromAllocations(prisma, data.projectId, allocs);
    } catch {
      return jsonError("Nieprawidłowy projekt", 400);
    }
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.incomeInvoice.create({
        data: {
          invoiceNumber: data.invoiceNumber,
          contractor: data.contractor,
          description: data.description ?? "",
          vatRate: rate,
          netAmount: data.netAmount,
          vatAmount: vat,
          grossAmount: gross,
          issueDate: new Date(data.issueDate),
          paymentDueDate: new Date(data.paymentDueDate),
          plannedIncomeDate: new Date(data.plannedIncomeDate),
          status: data.status,
          vatDestination: data.vatDestination,
          confirmedIncome: data.confirmedIncome ?? false,
          actualIncomeDate: data.actualIncomeDate ? new Date(data.actualIncomeDate) : null,
          notes: data.notes ?? "",
          projectId: pf.projectId,
          projectName: pf.projectName,
          incomeCategoryId: data.incomeCategoryId ?? null,
        },
        include: { incomeCategory: true, project: true, payments: true },
      });
      await replaceIncomeInvoiceAllocations(tx, created.id, allocs ?? []);
      if (data.sourcePlannedEventId) {
        try {
          await finalizePlannedToIncomeConversion(tx, data.sourcePlannedEventId, created.id);
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
    await ensureClosingIncomePaymentIfFullySettled(row.id);
    await syncIncomeInvoiceStatus(row.id);
    const fresh = await prisma.incomeInvoice.findUnique({
      where: { id: row.id },
      include: {
        incomeCategory: true,
        project: true,
        payments: {
        orderBy: { paymentDate: "asc" },
        include: { projectAllocations: { include: { project: { select: { id: true, name: true } } } } },
      },
        projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
        plannedPayments: { orderBy: { sortOrder: "asc" } },
      },
    });
    return jsonData(fresh ?? row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    if (e instanceof Error) {
      if (e.message === "INVALID_PLANNED_EVENT") return jsonError("Nie znaleziono zdarzenia planowanego.", 400);
      if (e.message === "PLANNED_TYPE_MISMATCH") return jsonError("Zdarzenie nie jest typu przychód.", 400);
      if (e.message === "PLANNED_NOT_ACTIVE") return jsonError("Zdarzenie nie jest aktywne (tylko „Zaplanowane”).", 400);
      if (e.message === "PLANNED_ALREADY_CONVERTED") return jsonError("Zdarzenie zostało już skonwertowane.", 409);
    }
    throw e;
  }
}
