import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { generateMissingRecurringOccurrences } from "@/lib/cashflow/recurring-sync";
import { endOfDay, startOfDay } from "date-fns";

type Ctx = { params: Promise<{ id: string }> };

function parseUntilDate(body: unknown): Date | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { untilDate?: unknown }).untilDate;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : endOfDay(d);
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
  if (!tmpl.isActive) return jsonError("Reguła cykliczna jest nieaktywna", 400);

  const rangeStart = startOfDay(tmpl.startDate);
  if (until < rangeStart) {
    return jsonError("Data końca musi być nie wcześniej niż data startu reguły", 400);
  }

  const result = await generateMissingRecurringOccurrences(id, until);
  if (result.error === "not_found") return jsonError("Nie znaleziono", 404);
  if (result.error === "inactive") return jsonError("Reguła cykliczna jest nieaktywna", 400);

  return jsonData({
    created: result.created,
    untilDate: until.toISOString(),
    totalDates: result.totalDates,
  });
}
