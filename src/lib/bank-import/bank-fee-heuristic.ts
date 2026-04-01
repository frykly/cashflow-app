/**
 * Proste wykrywanie opłat/prowizji bankowych z opisu wyciągu (bez NLP).
 */
const FEE_PHRASES = [
  "opłata przelew",
  "opłata - przelew",
  "opłata przelew zew",
  "opłata przelew natych",
  "prowizja",
  "opłata za przelew",
  "opłata bank",
  "pobranie opłaty",
];

export function looksLikeBankFeeDescription(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  return FEE_PHRASES.some((p) => t.includes(p));
}

/** Czy nazwa/slug kategorii wygląda na opłaty bankowe (bez twardej listy ID). */
export function isExpenseCategoryBankFeesLike(cat: { name: string; slug: string }): boolean {
  const s = `${cat.name} ${cat.slug}`.toLowerCase();
  return (
    /\bopłat(y|a|ę|om)?\s+bank/.test(s) ||
    /\bbankow(e|ych|a)?\s+opłat/.test(s) ||
    (s.includes("bank") && s.includes("opłat")) ||
    s.includes("opłaty-bankowe") ||
    s.includes("bank_fees")
  );
}

/**
 * Wybór pierwszej pasującej kategorii „opłaty bankowe” z listy API, jeśli jest.
 */
export function suggestBankFeeCategoryId(categories: { id: string; name: string; slug: string }[]): string | null {
  const hit = categories.find((c) => isExpenseCategoryBankFeesLike(c));
  return hit?.id ?? null;
}
