import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { incomePaymentPlanReplaceSchema } from "@/lib/validation/schemas";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const invoiceInclude = {
  incomeCategory: true,
  project: true,
  payments: {
    orderBy: { paymentDate: "asc" as const },
    include: { projectAllocations: { include: { project: { select: { id: true, name: true } } } } },
  },
  projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
  plannedPayments: { orderBy: { sortOrder: "asc" as const } },
} as const;

export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = incomePaymentPlanReplaceSchema.parse(body);
    const inv = await prisma.incomeInvoice.findUnique({ where: { id } });
    if (!inv) return jsonError("Nie znaleziono", 404);

    await prisma.$transaction(async (tx) => {
      await tx.incomeInvoicePlannedPayment.deleteMany({ where: { incomeInvoiceId: id } });
      if (data.rows.length === 0) return;
      await tx.incomeInvoicePlannedPayment.createMany({
        data: data.rows.map((row, i) => ({
          incomeInvoiceId: id,
          dueDate: new Date(row.dueDate),
          plannedMainAmount: row.plannedMainAmount,
          plannedVatAmount: row.plannedVatAmount,
          note: row.note ?? "",
          sortOrder: row.sortOrder ?? i,
          status: row.status ?? "PLANNED",
        })),
      });
    });

    const fresh = await prisma.incomeInvoice.findUnique({
      where: { id },
      include: invoiceInclude,
    });
    if (!fresh) return jsonError("Nie znaleziono", 404);
    return jsonData(fresh);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
