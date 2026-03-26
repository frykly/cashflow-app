import { prisma } from "@/lib/db";
import {
  buildDailyForecast,
  collectMovements,
  costInvoiceMap,
  type ForecastDayRow,
} from "@/lib/cashflow/forecast";
import {
  buildCostPartyByDocumentNumber,
  buildIncomePartyByInvoiceNumber,
  enrichForecastEventsSummary,
} from "@/lib/cashflow/forecast-export-summary";
import { parseForecastRange } from "@/lib/cashflow/forecast-query";
import { differenceInCalendarDays } from "date-fns";
import { rowsToCsv } from "@/lib/csv-string";
import ExcelJS from "exceljs";

function splitMovements(r: ForecastDayRow) {
  let incomeMain = 0,
    incomeVat = 0,
    expenseMain = 0,
    expenseVat = 0;
  for (const m of r.movements) {
    if (m.kind === "income") {
      if (m.mainDelta > 0) incomeMain += m.mainDelta;
      else expenseMain += m.mainDelta;
      if (m.vatDelta > 0) incomeVat += m.vatDelta;
      else expenseVat += m.vatDelta;
    } else if (m.kind === "cost") {
      if (m.mainDelta < 0) expenseMain += m.mainDelta;
      else incomeMain += m.mainDelta;
      if (m.vatDelta < 0) expenseVat += m.vatDelta;
      else incomeVat += m.vatDelta;
    } else {
      if (m.mainDelta >= 0) incomeMain += m.mainDelta;
      else expenseMain += m.mainDelta;
      if (m.vatDelta >= 0) incomeVat += m.vatDelta;
      else expenseVat += m.vatDelta;
    }
  }
  return { incomeMain, incomeVat, expenseMain, expenseVat };
}

function rowToExport(
  r: ForecastDayRow,
  incomeParty: Map<string, string | undefined>,
  costParty: Map<string, string | undefined>,
) {
  const { incomeMain, incomeVat, expenseMain, expenseVat } = splitMovements(r);
  const rawEv = r.movements.map((m) => `${m.kind}:${m.label}`).join(" | ");
  const ev = enrichForecastEventsSummary(rawEv, incomeParty, costParty);
  return [
    r.dayKey,
    String(r.mainStart),
    String(r.vatStart),
    String(incomeMain),
    String(incomeVat),
    String(expenseMain),
    String(expenseVat),
    String(r.mainEnd),
    String(r.vatEnd),
    String(r.totalEnd),
    ev.slice(0, 2000),
  ];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const { from, to } = parseForecastRange(searchParams);
  const daysSpan = Math.max(0, differenceInCalendarDays(to, from));
  const fmt = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const [settings, incomes, costs, events] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.incomeInvoice.findMany({ include: { payments: true } }),
    prisma.costInvoice.findMany({ include: { payments: true } }),
    prisma.plannedFinancialEvent.findMany(),
  ]);

  const movements = collectMovements(incomes, costs, events);
  const costMap = costInvoiceMap(costs);
  const rows = buildDailyForecast(movements, settings, from, to, costMap);

  const incomeParty = buildIncomePartyByInvoiceNumber(incomes);
  const costParty = buildCostPartyByDocumentNumber(costs);

  const header = [
    "date",
    "mainOpening",
    "vatOpening",
    "incomeMain",
    "incomeVat",
    "expenseMain",
    "expenseVat",
    "mainClosing",
    "vatClosing",
    "totalClosing",
    "eventsSummary",
  ];

  const table = [header, ...rows.map((r) => rowToExport(r, incomeParty, costParty))];

  if (fmt === "csv") {
    const body = "\uFEFF" + rowsToCsv(table);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="prognoza-${daysSpan}d.csv"`,
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Prognoza");
  table.forEach((line) => ws.addRow(line));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="prognoza-${daysSpan}d.xlsx"`,
    },
  });
}
