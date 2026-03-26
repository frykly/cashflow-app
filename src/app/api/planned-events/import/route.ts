import { parse } from "csv-parse/sync";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { resolveExpenseCategoryByName, resolveIncomeCategoryByName } from "@/lib/category-resolve";

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
      const typeRaw = pick(r, "type", "typ").toUpperCase();
      const type = typeRaw === "INCOME" || typeRaw === "WPŁYW" ? "INCOME" : "EXPENSE";
      const title = pick(r, "title", "tytuł", "Tytuł");
      if (!title) {
        errors.push({ row: rowNum, message: "Brak title" });
        continue;
      }
      const amount = pick(r, "amount", "kwota");
      if (!amount) {
        errors.push({ row: rowNum, message: "Brak amount" });
        continue;
      }
      const plannedRaw = pick(r, "plannedDate", "data", "planowanaData");
      const plannedDate = plannedRaw ? new Date(plannedRaw) : null;
      if (!plannedDate || Number.isNaN(plannedDate.getTime())) {
        errors.push({ row: rowNum, message: "Niepoprawna plannedDate" });
        continue;
      }
      const statusRaw = pick(r, "status", "Status").toUpperCase();
      const status =
        statusRaw === "DONE" || statusRaw === "ZREALIZOWANE"
          ? "DONE"
          : statusRaw === "CANCELLED" || statusRaw === "ANULOWANE"
            ? "CANCELLED"
            : "PLANNED";
      const description = pick(r, "description", "opis");
      const notes = pick(r, "notes", "notatki");
      const catName = pick(r, "categoryName", "kategoria");
      let incomeCategoryId: string | null = null;
      let expenseCategoryId: string | null = null;
      if (type === "INCOME") incomeCategoryId = await resolveIncomeCategoryByName(catName || null);
      else expenseCategoryId = await resolveExpenseCategoryByName(catName || null);

      await prisma.plannedFinancialEvent.create({
        data: {
          type,
          title,
          description,
          amount,
          plannedDate,
          status,
          notes,
          incomeCategoryId,
          expenseCategoryId,
        },
      });
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
