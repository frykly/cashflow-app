import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { grossFromNetVat } from "@/lib/validation/gross";
import { inferVatRateFromAmounts } from "@/lib/vat-rate";
import { resolveExpenseCategoryByName } from "@/lib/category-resolve";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { finalizeNewCostPaymentAllocations } from "@/lib/payment-project-allocation/finalize";

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
      const documentNumber = pick(r, "documentNumber", "numer", "Numer");
      const supplier = pick(r, "supplierName", "supplier", "dostawca");
      if (!documentNumber || !supplier) {
        errors.push({ row: rowNum, message: "Brak documentNumber lub supplierName" });
        continue;
      }
      const netAmount = pick(r, "netAmount", "netto");
      const vatAmount = pick(r, "vatAmount", "vat");
      if (!netAmount || !vatAmount) {
        errors.push({ row: rowNum, message: "Brak netAmount lub vatAmount" });
        continue;
      }
      const gross = grossFromNetVat(netAmount, vatAmount);
      const vatRate = inferVatRateFromAmounts(Number(netAmount), Number(vatAmount));
      const documentDate = parseDate(pick(r, "documentDate", "dataDokumentu")) ?? new Date();
      const dueDate = parseDate(pick(r, "dueDate", "paymentDueDate")) ?? documentDate;
      const plannedPaymentDate = parseDate(pick(r, "plannedPaymentDate", "planowanaZapłata")) ?? dueDate;
      const statusRaw = pick(r, "status", "Status").toUpperCase();
      const status =
        statusRaw === "ZAPLACONA" || statusRaw === "ZAPŁACONA"
          ? "ZAPLACONA"
          : statusRaw === "PARTIALLY_PAID" || statusRaw === "CZĘŚCIOWO"
            ? "PARTIALLY_PAID"
            : statusRaw === "DO_ZAPLATY"
              ? "DO_ZAPLATY"
              : "PLANOWANA";
      const paid = status === "ZAPLACONA";
      const srcRaw = pick(r, "paymentSource", "źródło").toUpperCase().replace(/\s+/g, "");
      const paymentSource =
        srcRaw === "VAT"
          ? "VAT"
          : srcRaw === "VAT_THEN_MAIN" || srcRaw === "SPLIT" || (srcRaw.includes("VAT") && srcRaw.includes("MAIN"))
            ? "VAT_THEN_MAIN"
            : "MAIN";
      const description = pick(r, "description", "opis");
      const notes = pick(r, "notes", "notatki");
      const catName = pick(r, "categoryName", "kategoria");
      const expenseCategoryId = await resolveExpenseCategoryByName(catName || null);

      const created = await prisma.costInvoice.create({
        data: {
          documentNumber,
          supplier,
          description,
          vatRate,
          netAmount,
          vatAmount,
          grossAmount: gross,
          documentDate,
          paymentDueDate: dueDate,
          plannedPaymentDate,
          status,
          paid,
          paymentSource,
          notes,
          expenseCategoryId,
        },
      });
      if (paid) {
        await prisma.$transaction(async (tx) => {
          const pay = await tx.costInvoicePayment.create({
            data: {
              costInvoiceId: created.id,
              amountGross: gross,
              paymentDate: plannedPaymentDate,
              notes: "import CSV",
            },
            select: { id: true },
          });
          await finalizeNewCostPaymentAllocations(tx, created.id, pay.id, normalizeDecimalInput(gross.toString()), null);
        });
        await syncCostInvoiceStatus(created.id);
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
