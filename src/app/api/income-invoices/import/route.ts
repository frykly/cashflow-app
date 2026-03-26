import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { grossFromNetVat } from "@/lib/validation/gross";
import { inferVatRateFromAmounts } from "@/lib/vat-rate";
import { resolveIncomeCategoryByName } from "@/lib/category-resolve";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";

function pick(r: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function parseDate(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return new Date(`${t}T12:00:00.000Z`);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Oczekiwano multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return jsonError("Brak pliku (pole file)");

  const text = await file.text();
  let records: Record<string, string>[];
  try {
    records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch {
    return jsonError("Nie udało się sparsować CSV");
  }

  const errors: { row: number; message: string }[] = [];
  let ok = 0;
  let rowNum = 1;

  for (const raw of records) {
    rowNum++;
    const r = raw as Record<string, unknown>;
    try {
      const invoiceNumber = pick(r, "invoiceNumber", "numer", "Numer");
      const contractor = pick(r, "customerName", "contractor", "kontrahent", "Kontrahent");
      if (!invoiceNumber || !contractor) {
        errors.push({ row: rowNum, message: "Brak invoiceNumber lub customerName/contractor" });
        continue;
      }
      const netAmount = pick(r, "netAmount", "netto", "Netto");
      const vatAmount = pick(r, "vatAmount", "vat", "VAT");
      if (!netAmount || !vatAmount) {
        errors.push({ row: rowNum, message: "Brak netAmount lub vatAmount" });
        continue;
      }
      const gross = grossFromNetVat(netAmount, vatAmount);
      const vatRate = inferVatRateFromAmounts(Number(netAmount), Number(vatAmount));
      const issueDate = parseDate(pick(r, "issueDate", "dataWystawienia")) ?? new Date();
      const dueDate = parseDate(pick(r, "dueDate", "paymentDueDate", "termin")) ?? issueDate;
      const plannedIncomeDate = parseDate(pick(r, "plannedIncomeDate", "planowanaData")) ?? dueDate;
      const statusRaw = pick(r, "status", "Status").toUpperCase();
      const status =
        statusRaw === "OPLACONA" || statusRaw === "OPŁACONA"
          ? "OPLACONA"
          : statusRaw === "WYSTAWIONA"
            ? "WYSTAWIONA"
            : statusRaw === "PARTIALLY_RECEIVED" || statusRaw === "CZĘŚCIOWO"
              ? "PARTIALLY_RECEIVED"
              : "PLANOWANA";
      const vatDestination = pick(r, "vatDestination", "vatDest").toUpperCase() === "VAT" ? "VAT" : "MAIN";
      const description = pick(r, "description", "opis");
      const notes = pick(r, "notes", "notatki");
      const catName = pick(r, "categoryName", "kategoria");
      const incomeCategoryId = await resolveIncomeCategoryByName(catName || null);

      const created = await prisma.incomeInvoice.create({
        data: {
          invoiceNumber,
          contractor,
          description,
          vatRate,
          netAmount,
          vatAmount,
          grossAmount: gross,
          issueDate,
          paymentDueDate: dueDate,
          plannedIncomeDate,
          status,
          vatDestination,
          confirmedIncome: false,
          notes,
          incomeCategoryId,
        },
      });
      if (status === "OPLACONA") {
        await prisma.incomeInvoicePayment.create({
          data: {
            incomeInvoiceId: created.id,
            amountGross: gross,
            paymentDate: plannedIncomeDate,
            notes: "import CSV",
          },
        });
        await syncIncomeInvoiceStatus(created.id);
      }
      ok++;
    } catch (e) {
      errors.push({
        row: rowNum,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return jsonData({ ok, errors });
}
