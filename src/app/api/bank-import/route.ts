import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { parseBankStatementCsv } from "@/lib/bank-import/parse-csv";
import type { BankImportSkippedDetail } from "@/lib/bank-import/import-skipped-types";
import {
  computeBankTransactionDedupeKey,
  computeLegacyBankTransactionDedupeKey,
  legacyOnlyStrongDuplicate,
  strongFallbackBankDuplicateMatch,
} from "@/lib/bank-import/dedupe-key";
import type { Prisma } from "@prisma/client";

export type { BankImportSkippedDetail } from "@/lib/bank-import/import-skipped-types";

const accountTypes = new Set(["MAIN", "VAT"]);

function preview(s: string, max = 160): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
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

  /** Unikalne triple (konto z formularza | dzień UTC | kwota) z bieżącego pliku — do batchowego pobrania kandydatów fallback. */
  const tripleSet = new Set<string>();
  for (const r of rows) {
    const day = r.bookingDate.toISOString().slice(0, 10);
    tripleSet.add(`${accountType}\t${day}\t${String(r.amountGrosze)}`);
  }
  const FALLBACK_OR_CHUNK = 60;
  const tripleLines = [...tripleSet];
  type FallbackTx = {
    id: string;
    importId: string;
    bookingDate: Date;
    amount: number;
    accountType: string;
    description: string;
    counterpartyName: string | null;
    counterpartyAccount: string | null;
    createdAt: Date;
  };
  const fallbackPool: FallbackTx[] = [];
  const fallbackSeenIds = new Set<string>();
  for (let c = 0; c < tripleLines.length; c += FALLBACK_OR_CHUNK) {
    const chunk = tripleLines.slice(c, c + FALLBACK_OR_CHUNK);
    const orWhere: Prisma.BankTransactionWhereInput[] = chunk.map((line) => {
      const [at, day, amtStr] = line.split("\t");
      const amount = Number(amtStr);
      const dayStart = new Date(`${day}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      return {
        AND: [{ accountType: at }, { amount }, { bookingDate: { gte: dayStart, lt: dayEnd } }],
      };
    });
    if (orWhere.length === 0) continue;
    const part = await prisma.bankTransaction.findMany({
      where: { OR: orWhere },
      select: {
        id: true,
        importId: true,
        bookingDate: true,
        amount: true,
        accountType: true,
        description: true,
        counterpartyName: true,
        counterpartyAccount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    for (const p of part) {
      if (fallbackSeenIds.has(p.id)) continue;
      fallbackSeenIds.add(p.id);
      fallbackPool.push(p);
    }
  }
  fallbackPool.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

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
    bookingDate: r.bookingDate.toISOString(),
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
          description: true,
          counterpartyName: true,
          counterpartyAccount: true,
        },
      });
      if (!st) {
        /* nietypowe — traktuj jak brak kolizji */
      } else {
        const sameMaterial =
          st.dedupeInputText != null && st.dedupeInputText === r.dedupeRawMaterial;

        if (sameMaterial) {
          skippedDuplicates += 1;
          skippedDetails.push({
            csvLine: r.sourceLine,
            reason: "existing_in_database",
            matchedKeyKind: "legacy",
            fingerprintNew: key,
            fingerprintLegacy: legacy,
            ...basePreview(r),
            decisionNote:
              "Fingerprint legacy zgadza się z rekordem w bazie; zapisany materiał deduplikacji (dedupeInputText) jest identyczny z tym wierszem CSV.",
            materialIdenticalToStored: true,
            storedDedupeInputPreview: st.dedupeInputText ? preview(st.dedupeInputText, 220) : undefined,
            matchedTransactionId: st.id,
            matchedImportId: st.importId,
          });
          continue;
        }

        const legacyOnlyOld = !st.dedupeInputText && st.dedupeKey === legacy;
        if (legacyOnlyOld) {
          if (legacyOnlyStrongDuplicate({ row: r, stored: st })) {
            skippedDuplicates += 1;
            skippedDetails.push({
              csvLine: r.sourceLine,
              reason: "existing_in_database",
              matchedKeyKind: "legacy",
              fingerprintNew: key,
              fingerprintLegacy: legacy,
              ...basePreview(r),
              decisionNote:
                "Kolizja legacy — rekord w bazie bez dedupeInputText: zgodny kontrahent, rachunek oraz materiał z zapisanym opisem — uznano za duplikat.",
              materialIdenticalToStored: false,
              storedDedupeInputPreview: preview(st.description, 220),
              matchedTransactionId: st.id,
              matchedImportId: st.importId,
            });
            continue;
          }
          /* Słaba kolizja legacy (np. inny kontrahent / rachunek / pełny materiał) — importuj jako osobną transakcję. */
        }
        /* Rekord z dedupeInputText różnym od CSV albo słaba kolizja legacy-only — importuj */
      }
    }

    let matchedFallback: { id: string; importId: string } | null = null;
    for (const st of fallbackPool) {
      if (
        strongFallbackBankDuplicateMatch({
          rowAccountType: accountType,
          rowBookingDate: r.bookingDate,
          rowAmountGrosze: r.amountGrosze,
          rowDescription: r.description,
          rowCounterpartyName: r.counterpartyName,
          rowCounterpartyAccount: r.counterpartyAccount,
          stored: st,
        })
      ) {
        matchedFallback = { id: st.id, importId: st.importId };
        break;
      }
    }
    if (matchedFallback) {
      skippedDuplicates += 1;
      skippedDetails.push({
        csvLine: r.sourceLine,
        reason: "legacy_strong_match",
        matchedKeyKind: null,
        fingerprintNew: key,
        fingerprintLegacy: legacy,
        ...basePreview(r),
        decisionNote:
          "Duplikat wykryty po dacie, kwocie i opisie (fallback). Fingerprint z pełnego materiału bankowego nie zgadzał się z rekordem w bazie — różnił się blok „Dane operacji” lub inne metadane.",
        matchedTransactionId: matchedFallback.id,
        matchedImportId: matchedFallback.importId,
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
    const emptyImport = await prisma.bankImport.create({
      data: {
        fileName,
        skippedLinesJson: JSON.stringify(skippedDetails),
      },
    });
    return jsonData(
      {
        import: emptyImport,
        transactionCount: 0,
        skippedDuplicates,
        skippedDetails,
        parseErrors: errors,
        format,
        message: `Nie dodano nowych transakcji: wszystkie ${rows.length} wierszy to duplikaty już w bazie lub powtórzenia w pliku. Szczegóły w skippedDetails.`,
      },
      { status: 201 },
    );
  }

  const created = await prisma.bankImport.create({
    data: {
      fileName,
      skippedLinesJson: JSON.stringify(skippedDetails),
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
