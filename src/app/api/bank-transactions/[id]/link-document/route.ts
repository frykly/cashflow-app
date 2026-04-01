import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { z } from "zod";

const bodySchema = z
  .object({
    costInvoiceId: z.string().min(1).optional(),
    incomeInvoiceId: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.costInvoiceId) !== Boolean(b.incomeInvoiceId), {
    message: "Podaj dokładnie jeden: costInvoiceId albo incomeInvoiceId",
  });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.flatten().formErrors.join("; ") || "Walidacja", 422);

  const tx = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);

  if (parsed.data.costInvoiceId) {
    const inv = await prisma.costInvoice.findUnique({ where: { id: parsed.data.costInvoiceId } });
    if (!inv) return jsonError("Nie znaleziono faktury kosztowej", 404);
    const updated = await prisma.bankTransaction.update({
      where: { id },
      data: {
        status: "LINKED_COST",
        linkedCostInvoiceId: inv.id,
        matchedInvoiceId: null,
        createdCostId: null,
      },
    });
    return jsonData(updated);
  }

  const inv = await prisma.incomeInvoice.findUnique({ where: { id: parsed.data.incomeInvoiceId! } });
  if (!inv) return jsonError("Nie znaleziono faktury przychodu", 404);
  const updated = await prisma.bankTransaction.update({
    where: { id },
    data: {
      status: "LINKED_INCOME",
      matchedInvoiceId: inv.id,
      linkedCostInvoiceId: null,
      createdCostId: null,
    },
  });
  return jsonData(updated);
}
