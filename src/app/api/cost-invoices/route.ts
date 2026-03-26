import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { resolveCostInvoiceAmounts } from "@/lib/validation/cost-invoice-amounts";
import { costInvoiceCreateSchema } from "@/lib/validation/schemas";
import { buildCostWhere } from "@/lib/prisma-list-filters";
import type { VatRatePct } from "@/lib/vat-rate";
import { ensureClosingCostPaymentIfFullySettled } from "@/lib/cashflow/invoice-auto-settlement";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { ZodError } from "zod";

const sortable = new Set(["plannedPaymentDate", "documentDate", "createdAt", "paymentDueDate"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = sortable.has(searchParams.get("sort") ?? "")
    ? (searchParams.get("sort") as "plannedPaymentDate" | "documentDate" | "createdAt" | "paymentDueDate")
    : "plannedPaymentDate";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  const where = buildCostWhere(searchParams);

  const rows = await prisma.costInvoice.findMany({
    where,
    orderBy: { [sort]: order },
    include: { expenseCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
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
    const row = await prisma.costInvoice.create({
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
        projectName: data.projectName ?? null,
        expenseCategoryId: data.expenseCategoryId ?? null,
      },
      include: { expenseCategory: true, payments: true },
    });
    await ensureClosingCostPaymentIfFullySettled(row.id);
    await syncCostInvoiceStatus(row.id);
    const fresh = await prisma.costInvoice.findUnique({
      where: { id: row.id },
      include: { expenseCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
    });
    return jsonData(fresh ?? row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
