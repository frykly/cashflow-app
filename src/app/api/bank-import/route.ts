import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { parseBankStatementCsv } from "@/lib/bank-import/parse-csv";
import {
  computeBankTransactionDedupeKey,
  computeLegacyBankTransactionDedupeKey,
} from "@/lib/bank-import/dedupe-key";

const accountTypes = new Set(["MAIN", "VAT"]);

export type BankImportSkippedDetail = {
  csvLine: number;
  reason: "existing_in_database" | "duplicate_within_file";
  /** Który fingerprint zadziałał przy dopasowaniu do bazy */
  matchedKeyKind: "new" | "legacy" | null;
  fingerprintNew: string;
  fingerprintLegacy: string;
  /** Przy istniejącym rekordzie w bazie */
  matchedTransactionId?: string;
  matchedImportId?: string;
  /** Przy duplikacie w obrębie pliku — pierwszy wiersz z tym samym fingerprintem */
  duplicateOfCsvLine?: number;
};

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
      dedupeMaterial: r.dedupeRawMaterial,
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
    select: { id: true, dedupeKey: true, importId: true },
  });
  const byDedupeKey = new Map<string, { id: string; importId: string }>();
  for (const e of existingRows) {
    if (e.dedupeKey) byDedupeKey.set(e.dedupeKey, { id: e.id, importId: e.importId });
  }

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
    dedupeInputText: string;
  }[] = [];

  let skippedDuplicates = 0;
  const skippedDetails: BankImportSkippedDetail[] = [];
  /** Tylko fingerprint „nowy” — legacy jest zbyt szeroki do wykrywania duplikatów w pliku */
  const seenNewKeyInFile = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const key = keysNew[i]!;
    const legacy = keysLegacy[i]!;

    const existingByNew = byDedupeKey.get(key);
    const existingByLegacy = byDedupeKey.get(legacy);
    const existing = existingByNew ?? existingByLegacy;

    if (existing) {
      skippedDuplicates += 1;
      skippedDetails.push({
        csvLine: r.sourceLine,
        reason: "existing_in_database",
        matchedKeyKind: existingByNew ? "new" : "legacy",
        fingerprintNew: key,
        fingerprintLegacy: legacy,
        matchedTransactionId: existing.id,
        matchedImportId: existing.importId,
      });
      continue;
    }

    const firstLineSameNew = seenNewKeyInFile.get(key);
    if (firstLineSameNew !== undefined) {
      skippedDuplicates += 1;
      skippedDetails.push({
        csvLine: r.sourceLine,
        reason: "duplicate_within_file",
        matchedKeyKind: "new",
        fingerprintNew: key,
        fingerprintLegacy: legacy,
        duplicateOfCsvLine: firstLineSameNew,
      });
      continue;
    }

    seenNewKeyInFile.set(key, r.sourceLine);

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
      dedupeInputText: r.dedupeRawMaterial.slice(0, 12000),
    });
  }

  if (createPayload.length === 0) {
    return jsonData(
      {
        import: null,
        transactionCount: 0,
        skippedDuplicates,
        skippedDetails,
        parseErrors: errors,
        format,
        message: `Nie dodano nowych transakcji: wszystkie ${rows.length} wierszy to duplikaty już w bazie lub powtórzenia w pliku. Szczegóły w skippedDetails.`,
      },
      { status: 200 },
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
      skippedDetails,
      parseErrors: errors,
      format,
      message:
        skippedDuplicates > 0 ?
          `Zaimportowano ${createPayload.length} nowych wierszy; pominięto ${skippedDuplicates} (duplikaty).`
        : null,
    },
    { status: 201 },
  );
}
