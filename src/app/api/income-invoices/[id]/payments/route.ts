import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { incomePaymentCreateSchema } from "@/lib/validation/schemas";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import { decToNumber } from "@/lib/cashflow/money";
import { PAY_EPS, sumIncomePaymentsGross } from "@/lib/cashflow/settlement";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const inv = await prisma.incomeInvoice.findUnique({
    where: { id },
    include: { payments: { orderBy: { paymentDate: "asc" } } },
  });
  if (!inv) return jsonError("Nie znaleziono", 404);
  return jsonData(inv.payments);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = incomePaymentCreateSchema.parse(body);
    const inv = await prisma.incomeInvoice.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!inv) return jsonError("Nie znaleziono", 404);
    const next = decToNumber(data.amountGross);
    const cur = sumIncomePaymentsGross(inv.payments);
    if (cur + next > decToNumber(inv.grossAmount) + PAY_EPS) {
      return jsonError("Suma wpłat przekroczyłaby kwotę brutto faktury.");
    }
    const row = await prisma.incomeInvoicePayment.create({
      data: {
        incomeInvoiceId: id,
        amountGross: data.amountGross,
        paymentDate: new Date(data.paymentDate),
        notes: data.notes ?? "",
      },
    });
    await syncIncomeInvoiceStatus(id);
    return jsonData(row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
