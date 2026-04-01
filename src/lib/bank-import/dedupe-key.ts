import { createHash } from "crypto";

function normDesc(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function normParty(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normAccount(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, "").toLowerCase();
}

/**
 * Legacy: data + kwota + opis + konto (bez kontrahenta) — zgodność z istniejącymi wierszami w DB.
 */
export function computeLegacyBankTransactionDedupeKey(params: {
  accountType: string;
  bookingDate: Date;
  amountGrosze: number;
  description: string;
}): string {
  const day = params.bookingDate.toISOString().slice(0, 10);
  const norm = normDesc(params.description);
  const raw = `${params.accountType}|${day}|${params.amountGrosze}|${norm}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Nowszy fingerprint: dodaje kontrahenta i fragment rachunku, żeby nie mylić dwóch przelewów
 * tego samego dnia o podobnym tytule do różnych odbiorców.
 */
export function computeBankTransactionDedupeKey(params: {
  accountType: string;
  bookingDate: Date;
  amountGrosze: number;
  description: string;
  counterpartyName?: string | null;
  counterpartyAccount?: string | null;
}): string {
  const day = params.bookingDate.toISOString().slice(0, 10);
  const raw = `${params.accountType}|${day}|${params.amountGrosze}|${normDesc(params.description)}|${normParty(params.counterpartyName)}|${normAccount(params.counterpartyAccount)}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
