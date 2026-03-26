import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { startOfDay } from "date-fns";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tmpl = await prisma.recurringTemplate.findUnique({ where: { id } });
  if (!tmpl) return jsonError("Nie znaleziono", 404);

  const today = startOfDay(new Date());
  const take = 12;

  const [costs, incomes] = await Promise.all([
    prisma.costInvoice.findMany({
      where: { sourceRecurringTemplateId: id, generatedOccurrenceDate: { gte: today } },
      orderBy: { generatedOccurrenceDate: "asc" },
      take,
      select: {
        id: true,
        documentNumber: true,
        plannedPaymentDate: true,
        grossAmount: true,
        status: true,
        isRecurringDetached: true,
      },
    }),
    prisma.incomeInvoice.findMany({
      where: { sourceRecurringTemplateId: id, generatedOccurrenceDate: { gte: today } },
      orderBy: { generatedOccurrenceDate: "asc" },
      take,
      select: {
        id: true,
        invoiceNumber: true,
        plannedIncomeDate: true,
        grossAmount: true,
        status: true,
        isRecurringDetached: true,
      },
    }),
  ]);

  return jsonData({
    templateType: tmpl.type,
    upcomingCosts: costs,
    upcomingIncomes: incomes,
  });
}
