import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { incomePaymentCreateSchema } from "@/lib/validation/schemas";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import { decToNumber } from "@/lib/cashflow/money";
import { PAY_EPS, sumIncomePaymentsGross } from "@/lib/cashflow/settlement";
import { ZodError } from "zod";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { finalizeNewIncomePaymentAllocations } from "@/lib/payment-project-allocation/finalize";
import { validatePaymentProjectAllocationGrossSum } from "@/lib/payment-project-allocation/validate";
import { documentGrossSlicesFromInvoice } from "@/lib/payment-project-allocation/distribute-read";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const inv = await prisma.incomeInvoice.findUnique({
    where: { id },
    include: {
      payments: {
        orderBy: { paymentDate: "asc" },
        include: { projectAllocations: { include: { project: { select: { id: true, name: true } } } } },
      },
    },
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
      include: { payments: true, projectAllocations: true },
    });
    if (!inv) return jsonError("Nie znaleziono", 404);
    const next = decToNumber(data.amountGross);
    const cur = sumIncomePaymentsGross(inv.payments);
    if (cur + next > decToNumber(inv.grossAmount) + PAY_EPS) {
      return jsonError("Suma wpłat przekroczyłaby kwotę brutto faktury.");
    }

    const gNorm = normalizeDecimalInput(String(data.amountGross));
    const docSlices = documentGrossSlicesFromInvoice(inv);
    const explicit = data.projectAllocations?.map((r) => ({
      projectId: r.projectId,
      grossAmount: normalizeDecimalInput(String(r.grossAmount)),
      description: r.description ?? "",
    }));
    if (docSlices.length > 1 && explicit && explicit.length > 0) {
      const err = validatePaymentProjectAllocationGrossSum(explicit, gNorm);
      if (err) return jsonError(err, 400);
    }

    try {
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.incomeInvoicePayment.create({
          data: {
            incomeInvoiceId: id,
            amountGross: data.amountGross,
            paymentDate: new Date(data.paymentDate),
            notes: data.notes ?? "",
          },
        });
        await finalizeNewIncomePaymentAllocations(tx, id, created.id, gNorm, explicit);
        return created;
      });
      await syncIncomeInvoiceStatus(id);
      const fresh = await prisma.incomeInvoicePayment.findUnique({
        where: { id: row.id },
        include: { projectAllocations: { include: { project: { select: { id: true, name: true } } } } },
      });
      return jsonData(fresh ?? row, { status: 201 });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("PAY_ALLOC_VALIDATION:")) {
        return jsonError(e.message.replace(/^PAY_ALLOC_VALIDATION:/, "").trim(), 400);
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
