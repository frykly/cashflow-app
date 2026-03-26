import { prisma } from "@/lib/db";
import { buildCostWhere } from "@/lib/prisma-list-filters";
import { decToNumber } from "@/lib/cashflow/money";
import { costRemainingGross, sumCostPaymentsGross } from "@/lib/cashflow/settlement";
import { formatDate } from "@/lib/format";
import { rowsToCsv } from "@/lib/csv-string";
import ExcelJS from "exceljs";

const sortable = new Set(["plannedPaymentDate", "documentDate", "createdAt", "paymentDueDate"]);

function num(n: number): string {
  return String(n);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = sortable.has(searchParams.get("sort") ?? "")
    ? (searchParams.get("sort") as "plannedPaymentDate" | "documentDate" | "createdAt" | "paymentDueDate")
    : "plannedPaymentDate";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";
  const fmt = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const where = buildCostWhere(searchParams);
  const rows = await prisma.costInvoice.findMany({
    where,
    orderBy: { [sort]: order },
    include: { expenseCategory: true, payments: true },
  });

  const header = [
    "documentNumber",
    "Dostawca",
    "description",
    "vatRate",
    "netAmount",
    "vatAmount",
    "grossAmount",
    "settled",
    "remaining",
    "percentSettled",
    "status",
    "plannedPaymentDate",
    "paymentDueDate",
    "categoryName",
    "recurringSource",
    "notes",
  ];

  const dataRows = rows.map((r) => {
    const settled = sumCostPaymentsGross(r.payments);
    const remaining = costRemainingGross(r, r.payments);
    const g = decToNumber(r.grossAmount);
    const pct = g > 0 ? Math.round((settled / g) * 1000) / 10 : 0;
    return [
      r.documentNumber,
      r.supplier,
      r.description,
      String(r.vatRate),
      num(decToNumber(r.netAmount)),
      num(decToNumber(r.vatAmount)),
      num(g),
      num(settled),
      num(remaining),
      String(pct),
      r.status,
      formatDate(r.plannedPaymentDate),
      formatDate(r.paymentDueDate),
      r.expenseCategory?.name ?? "",
      r.isGeneratedFromRecurring ? "cykliczne" : "ręczne",
      r.notes,
    ];
  });

  const table = [header, ...dataRows];

  if (fmt === "csv") {
    const body = "\uFEFF" + rowsToCsv(table);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="faktury-kosztowe.csv"',
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Koszty");
  table.forEach((line) => ws.addRow(line));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="faktury-kosztowe.xlsx"',
    },
  });
}
