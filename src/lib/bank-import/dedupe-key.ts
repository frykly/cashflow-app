import { createHash } from "crypto";

/**
 * Stały fingerprint wiersza bankowego — ten sam zakres dat/kwota/opis/konto
 * nie zostanie zapisany drugi raz przy kolejnym imporcie.
 */
export function computeBankTransactionDedupeKey(params: {
  accountType: string;
  bookingDate: Date;
  amountGrosze: number;
  description: string;
}): string {
  const day = params.bookingDate.toISOString().slice(0, 10);
  const norm = params.description.trim().replace(/\s+/g, " ").toLowerCase();
  const raw = `${params.accountType}|${day}|${params.amountGrosze}|${norm}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
