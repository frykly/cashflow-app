import { prisma } from "@/lib/db";
import { buildDailyForecast, collectMovements, costInvoiceMap } from "@/lib/cashflow/forecast";
import {
  buildCostPartyByDocumentNumber,
  buildIncomePartyByInvoiceNumber,
  enrichMovementLabel,
} from "@/lib/cashflow/forecast-export-summary";
import { parseForecastRange } from "@/lib/cashflow/forecast-query";
import { differenceInCalendarDays } from "date-fns";
import { jsonData } from "@/lib/api/json-response";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const { from, to } = parseForecastRange(searchParams);
  const daysSpan = Math.max(0, differenceInCalendarDays(to, from));

  const [settings, incomes, costs, events] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.incomeInvoice.findMany({ include: { payments: true } }),
    prisma.costInvoice.findMany({ include: { payments: true } }),
    prisma.plannedFinancialEvent.findMany(),
  ]);

  const movements = collectMovements(incomes, costs, events);
  const costMap = costInvoiceMap(costs);
  const rawRows = buildDailyForecast(movements, settings, from, to, costMap);

  const incomeParty = buildIncomePartyByInvoiceNumber(incomes);
  const costParty = buildCostPartyByDocumentNumber(costs);
  const rows = rawRows.map((row) => ({
    ...row,
    movements: row.movements.map((m) => ({
      ...m,
      label: enrichMovementLabel(m.kind, m.label, incomeParty, costParty),
    })),
  }));

  return jsonData({
    days: daysSpan,
    from: from.toISOString(),
    to: to.toISOString(),
    rows,
  });
}
