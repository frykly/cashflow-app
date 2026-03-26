import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { grossFromNetAndRate, vatFromNetAndRate } from "@/lib/validation/gross";
import { incomeInvoiceCreateSchema } from "@/lib/validation/schemas";
import { buildIncomeWhere } from "@/lib/prisma-list-filters";
import { ensureClosingIncomePaymentIfFullySettled } from "@/lib/cashflow/invoice-auto-settlement";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import { ZodError } from "zod";

const sortable = new Set(["plannedIncomeDate", "issueDate", "createdAt", "paymentDueDate"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = sortable.has(searchParams.get("sort") ?? "")
    ? (searchParams.get("sort") as "plannedIncomeDate" | "issueDate" | "createdAt" | "paymentDueDate")
    : "plannedIncomeDate";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";

  const where = buildIncomeWhere(searchParams);

  const rows = await prisma.incomeInvoice.findMany({
    where,
    orderBy: { [sort]: order },
    include: { incomeCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
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
    const row = await prisma.incomeInvoice.create({
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
        projectName: data.projectName ?? null,
        incomeCategoryId: data.incomeCategoryId ?? null,
      },
      include: { incomeCategory: true, payments: true },
    });
    await ensureClosingIncomePaymentIfFullySettled(row.id);
    await syncIncomeInvoiceStatus(row.id);
    const fresh = await prisma.incomeInvoice.findUnique({
      where: { id: row.id },
      include: { incomeCategory: true, payments: { orderBy: { paymentDate: "asc" } } },
    });
    return jsonData(fresh ?? row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
