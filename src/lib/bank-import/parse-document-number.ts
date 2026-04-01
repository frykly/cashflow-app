/**
 * Konserwatywne wyciąganie numeru dokumentu z tytułu/opisu przelewu (PL).
 * Zwraca null, jeśli nie ma rozsądnej pewności — wtedy użyj fallbacku (np. BANK-…).
 */
export function inferDocumentNumberFromBankText(text: string): string | null {
  const raw = text.trim();
  if (raw.length < 4) return null;

  const candidates: string[] = [];

  // FV/2024/12/123, FV/1/2024, FV 12/2024/1
  const fvSlash = raw.match(/\b(FV\/[A-Z0-9][A-Z0-9\/._-]{1,38})\b/i);
  if (fvSlash?.[1]) candidates.push(fvSlash[1].trim());

  // FV 2024/123, FV-2024-1
  const fvSp = raw.match(/\b(FV[\s\-][A-Z0-9][A-Z0-9\/._\s-]{1,36})\b/i);
  if (fvSp?.[1]) candidates.push(fvSp[1].replace(/\s+/g, " ").trim());

  // „Faktura (VAT) nr …” / „numer: …”
  const fakturaNr = raw.match(
    /\b(?:faktur[aąy]?)(?:\s+VAT)?\s+(?:nr\.?|numer|n°)\s*[:\s#]?\s*([A-Z0-9][A-Z0-9\/._-]{1,35})\b/i,
  );
  if (fakturaNr?.[1]) candidates.push(fakturaNr[1].trim());

  // Nr ref. / Ref: / Zlecenie:
  const ref = raw.match(/\b(?:nr\.?\s*ref\.?|ref\.?|zlecenie)\s*[:\s#]+\s*([A-Z0-9][A-Z0-9\/._-]{2,35})\b/i);
  if (ref?.[1]) candidates.push(ref[1].trim());

  for (const c of candidates) {
    const cleaned = c.replace(/^[\s:;|]+|[\s:;|]+$/g, "");
    if (cleaned.length >= 3 && cleaned.length <= 80 && !/^[\d\s.,]+$/.test(cleaned)) {
      return cleaned.slice(0, 80);
    }
  }

  return null;
}
