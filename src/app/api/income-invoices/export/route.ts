import { prisma } from "@/lib/db";
import { buildIncomeWhere } from "@/lib/prisma-list-filters";
import { decToNumber } from "@/lib/cashflow/money";
import { incomeRemainingGross, sumIncomePaymentsGross } from "@/lib/cashflow/settlement";
import { formatDate } from "@/lib/format";
import { rowsToCsv } from "@/lib/csv-string";
import ExcelJS from "exceljs";

const sortable = new Set(["plannedIncomeDate", "issueDate", "createdAt", "paymentDueDate"]);

function num(n: number): string {
  return String(n);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = sortable.has(searchParams.get("sort") ?? "")
    ? (searchParams.get("sort") as "plannedIncomeDate" | "issueDate" | "createdAt" | "paymentDueDate")
    : "plannedIncomeDate";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";
  const fmt = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const where = buildIncomeWhere(searchParams);
  const rows = await prisma.incomeInvoice.findMany({
    where,
    orderBy: { [sort]: order },
    include: { incomeCategory: true, payments: true },
  });

  const header = [
    "invoiceNumber",
    "Kontrahent",
    "description",
    "vatRate",
    "netAmount",
    "vatAmount",
    "grossAmount",
    "settled",
    "remaining",
    "percentSettled",
    "status",
    "plannedIncomeDate",
    "paymentDueDate",
    "categoryName",
    "recurringSource",
    "notes",
  ];

  const dataRows = rows.map((r) => {
    const settled = sumIncomePaymentsGross(r.payments);
    const remaining = incomeRemainingGross(r, r.payments);
    const g = decToNumber(r.grossAmount);
    const pct = g > 0 ? Math.round((settled / g) * 1000) / 10 : 0;
    return [
      r.invoiceNumber,
      r.contractor,
      r.description,
      String(r.vatRate),
      num(decToNumber(r.netAmount)),
      num(decToNumber(r.vatAmount)),
      num(g),
      num(settled),
      num(remaining),
      String(pct),
      r.status,
      formatDate(r.plannedIncomeDate),
      formatDate(r.paymentDueDate),
      r.incomeCategory?.name ?? "",
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
        "Content-Disposition": 'attachment; filename="faktury-przychodowe.csv"',
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Przychody");
  table.forEach((line) => ws.addRow(line));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="faktury-przychodowe.xlsx"',
    },
  });
}
