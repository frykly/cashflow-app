import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { costPaymentCreateSchema } from "@/lib/validation/schemas";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { decToNumber } from "@/lib/cashflow/money";
import { PAY_EPS, sumCostPaymentsGross } from "@/lib/cashflow/settlement";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const inv = await prisma.costInvoice.findUnique({
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
    const data = costPaymentCreateSchema.parse(body);
    const inv = await prisma.costInvoice.findUnique({
      where: { id },
      include: { payments: true },
    });
    if (!inv) return jsonError("Nie znaleziono", 404);
    const next = decToNumber(data.amountGross);
    const cur = sumCostPaymentsGross(inv.payments);
    if (cur + next > decToNumber(inv.grossAmount) + PAY_EPS) {
      return jsonError("Suma płatności przekroczyłaby kwotę brutto dokumentu.");
    }
    const row = await prisma.costInvoicePayment.create({
      data: {
        costInvoiceId: id,
        amountGross: data.amountGross,
        paymentDate: new Date(data.paymentDate),
        notes: data.notes ?? "",
      },
    });
    await syncCostInvoiceStatus(id);
    return jsonData(row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
