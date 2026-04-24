import { prisma } from "@/lib/db";
import { parseDayKey } from "@/lib/cashflow/dates";
import { buildDailyForecast, collectMovements, costInvoiceMap } from "@/lib/cashflow/forecast";
import { startOfDay } from "date-fns";

/** Koniec dnia MAIN/VAT z tej samej logiki co `/api/forecast` (jeden wiersz dla `dayKey`). */
export async function getForecastClosingBalancesForDay(dayKey: string): Promise<{
  mainEnd: number;
  vatEnd: number;
} | null> {
  const d = startOfDay(parseDayKey(dayKey));
  const [settings, incomes, costs, events, otherIncomes] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.incomeInvoice.findMany({
      include: { payments: true, plannedPayments: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.costInvoice.findMany({ include: { payments: true } }),
    prisma.plannedFinancialEvent.findMany(),
    prisma.otherIncome.findMany(),
  ]);
  const movements = collectMovements(incomes, costs, events, otherIncomes);
  const rows = buildDailyForecast(movements, settings, d, d, costInvoiceMap(costs));
  const row = rows[0];
  if (!row) return null;
  return { mainEnd: row.mainEnd, vatEnd: row.vatEnd };
}
