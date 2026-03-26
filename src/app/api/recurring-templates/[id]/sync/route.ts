import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { syncRecurringTemplateSchedule } from "@/lib/cashflow/recurring-sync";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tmpl = await prisma.recurringTemplate.findUnique({ where: { id } });
  if (!tmpl) return jsonError("Nie znaleziono", 404);
  if (!tmpl.isActive) return jsonError("Najpierw aktywuj regułę lub użyj „Usuń przyszłe wygenerowane”", 400);

  const result = await syncRecurringTemplateSchedule(id);
  return jsonData(result);
}
