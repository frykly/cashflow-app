import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { occurrenceDatesInRange } from "@/lib/cashflow/recurring";
import { plannedAmountsFromRecurringTemplate } from "@/lib/cashflow/recurring-planned-amounts";
import { endOfDay, isBefore, startOfDay } from "date-fns";

type Ctx = { params: Promise<{ id: string }> };

function parseUntilDate(body: unknown): Date | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { untilDate?: unknown }).untilDate;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }

  const until = parseUntilDate(body);
  if (!until) return jsonError("Podaj datę końcową (untilDate, ISO lub YYYY-MM-DD)", 400);

  const tmpl = await prisma.recurringTemplate.findUnique({ where: { id } });
  if (!tmpl) return jsonError("Nie znaleziono", 404);
  if (!tmpl.isActive) return jsonError("Zdarzenie powtarzalne jest nieaktywne", 400);

  const rangeStart = startOfDay(tmpl.startDate);
  const rangeEnd = endOfDay(until);
  if (isBefore(rangeEnd, rangeStart)) {
    return jsonError("Data końca musi być nie wcześniej niż data startu zdarzenia", 400);
  }

  const dates = occurrenceDatesInRange(tmpl, rangeStart, rangeEnd);
  const { amount, amountVat } = plannedAmountsFromRecurringTemplate(tmpl);

  let created = 0;
  for (const d of dates) {
    const exists = await prisma.plannedFinancialEvent.findFirst({
      where: {
        recurringTemplateId: id,
        plannedDate: { gte: startOfDay(d), lte: endOfDay(d) },
      },
    });
    if (exists) continue;

    await prisma.plannedFinancialEvent.create({
      data: {
        type: tmpl.type,
        title: tmpl.title,
        description: "",
        amount,
        amountVat,
        plannedDate: d,
        status: "PLANNED",
        notes: tmpl.notes ? `Powtarzalne: ${tmpl.notes}` : "",
        incomeCategoryId: tmpl.type === "INCOME" ? tmpl.incomeCategoryId : null,
        expenseCategoryId: tmpl.type === "EXPENSE" ? tmpl.expenseCategoryId : null,
        recurringTemplateId: id,
      },
    });
    created++;
  }

  return jsonData({ created, untilDate: until.toISOString(), totalDates: dates.length });
}
