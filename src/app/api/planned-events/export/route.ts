import { prisma } from "@/lib/db";
import { buildPlannedWhere } from "@/lib/prisma-list-filters";
import { decToNumber } from "@/lib/cashflow/money";
import { formatDate } from "@/lib/format";
import { rowsToCsv } from "@/lib/csv-string";
import ExcelJS from "exceljs";

const sortable = new Set(["plannedDate", "createdAt"]);

function num(n: number): string {
  return String(n);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = sortable.has(searchParams.get("sort") ?? "")
    ? (searchParams.get("sort") as "plannedDate" | "createdAt")
    : "plannedDate";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";
  const fmt = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const where = buildPlannedWhere(searchParams);
  const rows = await prisma.plannedFinancialEvent.findMany({
    where,
    orderBy: { [sort]: order },
    include: { incomeCategory: true, expenseCategory: true },
  });

  const header = [
    "type",
    "title",
    "description",
    "amount",
    "amountVat",
    "plannedDate",
    "status",
    "categoryName",
    "notes",
    "recurringTemplateId",
  ];

  const dataRows = rows.map((r) => {
    const cat =
      r.type === "INCOME" ? (r.incomeCategory?.name ?? "") : (r.expenseCategory?.name ?? "");
    return [
      r.type,
      r.title,
      r.description,
      num(decToNumber(r.amount)),
      num(decToNumber(r.amountVat)),
      formatDate(r.plannedDate),
      r.status,
      cat,
      r.notes,
      r.recurringTemplateId ?? "",
    ];
  });

  const table = [header, ...dataRows];

  if (fmt === "csv") {
    const body = "\uFEFF" + rowsToCsv(table);
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="zdarzenia.csv"',
      },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Zdarzenia");
  table.forEach((line) => ws.addRow(line));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="zdarzenia.xlsx"',
    },
  });
}
