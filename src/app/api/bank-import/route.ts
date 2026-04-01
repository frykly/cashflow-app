import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { parseBankStatementCsv } from "@/lib/bank-import/parse-csv";

const accountTypes = new Set(["MAIN", "VAT"]);

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("Oczekiwano multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) return jsonError("Brak pliku (pole file)");

  const fileName = file instanceof File && file.name ? file.name : "import.csv";
  const accountTypeRaw = form.get("accountType");
  const accountType =
    typeof accountTypeRaw === "string" && accountTypes.has(accountTypeRaw) ? accountTypeRaw : "MAIN";
  const currencyRaw = form.get("currency");
  const currency = typeof currencyRaw === "string" && currencyRaw.trim() ? currencyRaw.trim().toUpperCase() : "PLN";

  const text = await file.text();
  const { rows, errors, format } = parseBankStatementCsv(text);

  if (rows.length === 0) {
    const msg =
      errors.length > 0
        ? errors.map((e) => `Wiersz ${e.line}: ${e.message}`).join("; ")
        : "Brak poprawnych wierszy transakcji";
    return jsonError(msg);
  }

  const created = await prisma.bankImport.create({
    data: {
      fileName,
      transactions: {
        create: rows.map((r) => ({
          bookingDate: r.bookingDate,
          valueDate: r.valueDate ?? null,
          amount: r.amountGrosze,
          currency: r.currency ?? currency,
          description: r.description,
          counterpartyName: r.counterpartyName ?? null,
          counterpartyAccount: r.counterpartyAccount ?? null,
          accountType,
          status: "NEW",
        })),
      },
    },
  });

  return jsonData(
    {
      import: created,
      transactionCount: rows.length,
      parseErrors: errors,
      format,
    },
    { status: 201 },
  );
}
