import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { parseBankStatementCsv } from "@/lib/bank-import/parse-csv";
import {
  computeBankTransactionDedupeKey,
  computeLegacyBankTransactionDedupeKey,
} from "@/lib/bank-import/dedupe-key";

const accountTypes = new Set(["MAIN", "VAT"]);

function preview(s: string, max = 160): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export type BankImportSkippedDetail = {
  csvLine: number;
  reason: "existing_in_database" | "duplicate_within_file";
  matchedKeyKind: "new" | "legacy" | null;
  fingerprintNew: string;
  fingerprintLegacy: string;
  amountGrosze: number;
  descriptionPreview: string;
  dedupeMaterialPreview: string;
  counterpartyPreview: string | null;
  /** Krótki opis decyzji (diagnostyka) */
  decisionNote?: string;
  /** Przy dopasowaniu do rekordu z dedupeInputText w bazie — czy materiał jest identyczny */
  materialIdenticalToStored?: boolean;
  /** Skrót zapisane dedupeInputText w bazie (przy kolizji legacy) */
  storedDedupeInputPreview?: string;
  matchedTransactionId?: string;
  matchedImportId?: string;
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
  const seenNewKeyInFile = new Map<string, number>();

  const basePreview = (r: (typeof rows)[0]) => ({
    amountGrosze: r.amountGrosze,
    descriptionPreview: preview(r.description, 200),
    dedupeMaterialPreview: preview(r.dedupeRawMaterial, 220),
    counterpartyPreview: r.counterpartyName ?? r.counterpartyAccount ?? null,
  });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const key = keysNew[i]!;
    const legacy = keysLegacy[i]!;

    const existingByNew = byDedupeKey.get(key);

    if (existingByNew) {
      skippedDuplicates += 1;
      skippedDetails.push({
        csvLine: r.sourceLine,
        reason: "existing_in_database",
        matchedKeyKind: "new",
        fingerprintNew: key,
        fingerprintLegacy: legacy,
        ...basePreview(r),
        decisionNote: "Ten sam fingerprint „nowy” co istniejący rekord w bazie.",
        materialIdenticalToStored: true,
        matchedTransactionId: existingByNew.id,
        matchedImportId: existingByNew.importId,
      });
      continue;
    }

    const existingByLegacy = byDedupeKey.get(legacy);
    if (existingByLegacy) {
      const st = await prisma.bankTransaction.findUnique({
        where: { id: existingByLegacy.id },
        select: {
          id: true,
          importId: true,
          dedupeKey: true,
          dedupeInputText: true,
        },
      });
      if (!st) {
        /* nietypowe — traktuj jak brak kolizji */
      } else {
        const sameMaterial =
          st.dedupeInputText != null && st.dedupeInputText === r.dedupeRawMaterial;
        const oldRowLegacyOnly = !st.dedupeInputText && st.dedupeKey === legacy;

        if (sameMaterial || oldRowLegacyOnly) {
          skippedDuplicates += 1;
          skippedDetails.push({
            csvLine: r.sourceLine,
            reason: "existing_in_database",
            matchedKeyKind: "legacy",
            fingerprintNew: key,
            fingerprintLegacy: legacy,
            ...basePreview(r),
            decisionNote: sameMaterial
              ? "Fingerprint legacy zgadza się z rekordem w bazie; zapisany materiał deduplikacji (dedupeInputText) jest identyczny z tym wierszem CSV."
              : "Starszy rekord w bazie (tylko klucz legacy, bez zapisanego pełnego materiału) — uznano za ten sam przelew.",
            materialIdenticalToStored: sameMaterial,
            storedDedupeInputPreview: st.dedupeInputText ? preview(st.dedupeInputText, 220) : undefined,
            matchedTransactionId: st.id,
            matchedImportId: st.importId,
          });
          continue;
        }
        /* Kolizja tylko legacy: w bazie jest inny pełny materiał niż w CSV — to NIE ten sam przelew → importuj */
      }
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
        ...basePreview(r),
        decisionNote: "Drugi wiersz w pliku z tym samym fingerprintem „nowy” co wcześniej w tym pliku.",
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
