/** Zapis w `BankImport.skippedLinesJson` — pominięte wiersze przy POST `/api/bank-import`. */
export type BankImportSkippedDetail = {
  csvLine: number;
  bookingDate?: string;
  reason: "existing_in_database" | "duplicate_within_file" | "legacy_strong_match";
  matchedKeyKind: "new" | "legacy" | null;
  fingerprintNew: string;
  fingerprintLegacy: string;
  amountGrosze: number;
  descriptionPreview: string;
  dedupeMaterialPreview: string;
  counterpartyPreview: string | null;
  decisionNote?: string;
  materialIdenticalToStored?: boolean;
  storedDedupeInputPreview?: string;
  matchedTransactionId?: string;
  matchedImportId?: string;
  duplicateOfCsvLine?: number;
};
