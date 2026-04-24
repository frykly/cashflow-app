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
 * Kolizja tylko po legacy: stary rekord bez dedupeInputText — czy uznać za ten sam przelew co wiersz CSV.
 *
 * Blokada importu tylko przy „mocnym” dopasowaniu: ten sam kontrahent i rachunek oraz materiał zgodny
 * z tym, co mamy w bazie (opis = jedyny zapis pełnego tekstu przy starych importach).
 *
 * Jeśli różni się kontrahent, rachunek albo pełny materiał względem zapisu — zwraca false (importuj).
 */
export function legacyOnlyStrongDuplicate(params: {
  row: {
    dedupeRawMaterial: string;
    description: string;
    counterpartyName?: string | null;
    counterpartyAccount?: string | null;
  };
  stored: {
    description: string;
    counterpartyName: string | null;
    counterpartyAccount: string | null;
  };
}): boolean {
  const { row, stored } = params;
  if (normParty(row.counterpartyName) !== normParty(stored.counterpartyName)) return false;
  if (normAccount(row.counterpartyAccount) !== normAccount(stored.counterpartyAccount)) return false;

  const mat = normDesc(row.dedupeRawMaterial);
  const stDesc = normDesc(stored.description);
  if (mat === stDesc) return true;

  const short = normDesc(row.description);
  if (mat === short && short === stDesc) return true;

  return false;
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
 * Fingerprint bieżący: materiał deduplikacji = pełne „Dane operacji” (iPKO) lub pełny opis wiersza,
 * a nie skrócony tytuł wyświetlany w UI — dwa przelewy z tym samym tytułem, ale innymi szczegółami w polu banku,
 * dostają różne klucze. Dodatkowo kontrahent i rachunek (jeśli są w CSV).
 */
export function computeBankTransactionDedupeKey(params: {
  accountType: string;
  bookingDate: Date;
  amountGrosze: number;
  dedupeMaterial: string;
  counterpartyName?: string | null;
  counterpartyAccount?: string | null;
}): string {
  const day = params.bookingDate.toISOString().slice(0, 10);
  const mat = normDesc(params.dedupeMaterial);
  const raw = `${params.accountType}|${day}|${params.amountGrosze}|${mat}|${normParty(params.counterpartyName)}|${normAccount(params.counterpartyAccount)}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function relaxedNameOrAccountMatch(a: string | null | undefined, b: string | null | undefined, mode: "party" | "account"): boolean {
  const na = mode === "party" ? normParty(a) : normAccount(a);
  const nb = mode === "party" ? normParty(b) : normAccount(b);
  if (na === "" || nb === "") return true;
  return na === nb;
}

/** Małe litery, spacje, ł→l, bez znaków diakrytycznych — pod dopasowanie słów kluczowych opłat. */
function foldForBankFeeKeywords(s: string): string {
  return normDesc(s)
    .replace(/\u0142/g, "l")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Opłaty/prowizje o powtarzalnym, generycznym tytule — fallback po dacie+kwocie+opisie jest zbyt agresywny
 * (bank może naliczyć kilka identycznych kwot tego samego dnia). Dedupe po nowym fingerprintcie bez zmian.
 */
export function isGenericBankFeeDescription(description: string): boolean {
  const f = foldForBankFeeKeywords(description);
  if (f.includes("prowizja")) return true;
  if (f.includes("oplata")) return true; // opłata → po fold
  if (f.includes("split-payment")) return true;
  if (f.includes("przelew zew")) return true;
  return false;
}

/**
 * Fallback bez migracji: ten sam dzień księgowania (UTC), kwota, typ konta, ten sam znormalizowany opis
 * oraz zgodny kontrahent / rachunek albo puste jedno z pól (CSV vs rekord w bazie).
 * Używane dopiero gdy fingerprint „nowy” nie znalazł dopasowania.
 *
 * Dla generycznych opłat bankowych (patrz `isGenericBankFeeDescription`) zwraca zawsze `false` —
 * rozróżnienie wyłącznie po pełnym materiale / nowym fingerprintcie.
 */
export function strongFallbackBankDuplicateMatch(params: {
  rowAccountType: string;
  rowBookingDate: Date;
  rowAmountGrosze: number;
  rowDescription: string;
  rowCounterpartyName?: string | null;
  rowCounterpartyAccount?: string | null;
  stored: {
    accountType: string;
    bookingDate: Date;
    amount: number;
    description: string;
    counterpartyName: string | null;
    counterpartyAccount: string | null;
  };
}): boolean {
  if (
    isGenericBankFeeDescription(params.rowDescription) ||
    isGenericBankFeeDescription(params.stored.description)
  ) {
    return false;
  }
  if (params.rowAccountType !== params.stored.accountType) return false;
  if (params.rowAmountGrosze !== params.stored.amount) return false;
  const dRow = params.rowBookingDate.toISOString().slice(0, 10);
  const dSt = params.stored.bookingDate.toISOString().slice(0, 10);
  if (dRow !== dSt) return false;
  if (normDesc(params.rowDescription) !== normDesc(params.stored.description)) return false;
  if (!relaxedNameOrAccountMatch(params.rowCounterpartyName, params.stored.counterpartyName, "party")) return false;
  if (!relaxedNameOrAccountMatch(params.rowCounterpartyAccount, params.stored.counterpartyAccount, "account")) return false;
  return true;
}
