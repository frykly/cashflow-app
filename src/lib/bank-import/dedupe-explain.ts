import {
  computeBankTransactionDedupeKey,
  computeLegacyBankTransactionDedupeKey,
} from "@/lib/bank-import/dedupe-key";

export type BankTxDedupeExplainInput = {
  accountType: string;
  bookingDate: Date;
  amount: number;
  description: string;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  dedupeKey: string | null;
};

/**
 * Wyjaśnienie dla debugu: jak policzono fingerprint i czy rekord jest „legacy”.
 */
export function explainBankTransactionDedupe(tx: BankTxDedupeExplainInput): {
  fingerprintNew: string;
  fingerprintLegacy: string;
  matchesStored: "new" | "legacy" | "unknown" | "none";
  hint: string;
} {
  const amountGrosze = tx.amount;
  const fingerprintNew = computeBankTransactionDedupeKey({
    accountType: tx.accountType,
    bookingDate: tx.bookingDate,
    amountGrosze,
    description: tx.description,
    counterpartyName: tx.counterpartyName,
    counterpartyAccount: tx.counterpartyAccount,
  });
  const fingerprintLegacy = computeLegacyBankTransactionDedupeKey({
    accountType: tx.accountType,
    bookingDate: tx.bookingDate,
    amountGrosze,
    description: tx.description,
  });

  const stored = tx.dedupeKey;
  let matchesStored: "new" | "legacy" | "unknown" | "none" = "none";
  if (!stored) matchesStored = "none";
  else if (stored === fingerprintNew) matchesStored = "new";
  else if (stored === fingerprintLegacy) matchesStored = "legacy";
  else matchesStored = "unknown";

  const hint =
    matchesStored === "new" ?
      "Klucz zawiera konto, datę księgowania, kwotę, opis oraz kontrahenta i rachunek — mniej fałszywych duplikatów przy tym samym tytule."
    : matchesStored === "legacy" ?
      "Starszy zapis — fingerprint bez kontrahenta. Nowe importy używają wersji rozszerzonej."
    : matchesStored === "unknown" ?
      "Zapisany klucz nie pasuje do bieżącego wzoru (np. zmiana algorytmu lub dane edytowane ręcznie)."
    : "Brak klucza deduplikacji (stary import).";

  return { fingerprintNew, fingerprintLegacy, matchesStored, hint };
}
