import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { parseBankStatementCsv } from "@/lib/bank-import/parse-csv";
import {
  computeBankTransactionDedupeKey,
  computeLegacyBankTransactionDedupeKey,
} from "@/lib/bank-import/dedupe-key";

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

  const keysNew = rows.map((r) =>
    computeBankTransactionDedupeKey({
      accountType,
      bookingDate: r.bookingDate,
      amountGrosze: r.amountGrosze,
      description: r.description,
      counterpartyName: r.counterpartyName,
      counterpartyAccount: r.counterpartyAccount,
    }),
  );
  const keysLegacy = rows.map((r) =>
    computeLegacyBankTransactionDedupeKey({
      accountType,
      bookingDate: r.bookingDate,
      amountGrosze: r.amountGrosze,
      description: r.description,
    }),
  );
  const lookupKeys = [...new Set([...keysNew, ...keysLegacy])];
  const existingRows = await prisma.bankTransaction.findMany({
    where: { dedupeKey: { in: lookupKeys } },
    select: { dedupeKey: true },
  });
  const taken = new Set(existingRows.map((e) => e.dedupeKey).filter(Boolean) as string[]);

  const createPayload: {
    bookingDate: Date;
    valueDate: Date | null;
    amount: number;
    currency: string;
    description: string;
    counterpartyName: string | null;
    counterpartyAccount: string | null;
    accountType: string;
    status: string;
    dedupeKey: string;
  }[] = [];

  let skippedDuplicates = 0;
  const seenInFile = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const key = keysNew[i]!;
    const legacy = keysLegacy[i]!;
    if (taken.has(key) || taken.has(legacy) || seenInFile.has(key) || seenInFile.has(legacy)) {
      skippedDuplicates += 1;
      continue;
    }
    seenInFile.add(key);
    seenInFile.add(legacy);
    createPayload.push({
      bookingDate: r.bookingDate,
      valueDate: r.valueDate ?? null,
      amount: r.amountGrosze,
      currency: r.currency ?? currency,
      description: r.description,
      counterpartyName: r.counterpartyName ?? null,
      counterpartyAccount: r.counterpartyAccount ?? null,
      accountType,
      status: "NEW",
      dedupeKey: key,
    });
  }

  if (createPayload.length === 0) {
    return jsonError(
      `Wszystkie wiersze (${rows.length}) są duplikatami już obecnymi w systemie (ten sam fingerprint).`,
      400,
    );
  }

  const created = await prisma.bankImport.create({
    data: {
      fileName,
      transactions: {
        create: createPayload,
      },
    },
  });

  return jsonData(
    {
      import: created,
      transactionCount: createPayload.length,
      skippedDuplicates,
      parseErrors: errors,
      format,
    },
    { status: 201 },
  );
}
