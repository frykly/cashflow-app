import { prisma } from "@/lib/db";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

const bodySchema = z.object({
  targetCategoryId: z.string().min(1),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: sourceId } = await ctx.params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = bodySchema.parse(raw);
    if (data.targetCategoryId === sourceId) return jsonError("Wybierz inną kategorię docelową", 400);

    const [source, target] = await Promise.all([
      prisma.expenseCategory.findUnique({ where: { id: sourceId } }),
      prisma.expenseCategory.findUnique({ where: { id: data.targetCategoryId } }),
    ]);
    if (!source) return jsonError("Kategoria źródłowa nie istnieje", 404);
    if (!target) return jsonError("Kategoria docelowa nie istnieje", 404);
    if (!target.isActive) return jsonError("Kategoria docelowa jest zarchiwizowana — wybierz aktywną", 400);

    await prisma.$transaction([
      prisma.costInvoice.updateMany({
        where: { expenseCategoryId: sourceId },
        data: { expenseCategoryId: data.targetCategoryId },
      }),
      prisma.plannedFinancialEvent.updateMany({
        where: { expenseCategoryId: sourceId },
        data: { expenseCategoryId: data.targetCategoryId },
      }),
      prisma.recurringTemplate.updateMany({
        where: { expenseCategoryId: sourceId },
        data: { expenseCategoryId: data.targetCategoryId },
      }),
    ]);

    await prisma.expenseCategory.delete({ where: { id: sourceId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    return jsonError("Operacja nie powiodła się", 400);
  }
}
