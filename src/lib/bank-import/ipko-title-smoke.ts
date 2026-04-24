/**
 * Smoke: `npx tsx src/lib/bank-import/ipko-title-smoke.ts`
 * Sprawdza wyłącznie tytuł wyświetlany (description) z „Dane operacji” iPKO — bez dedupe.
 */
import assert from "node:assert/strict";
import { buildIpkoDescriptionAndParties, parseBankStatementCsv } from "./parse-csv";

function d(op: string, typ = "Przelew Split") {
  return buildIpkoDescriptionAndParties(op, typ).description;
}

// Case A — Tytuł
{
  const op =
    "Rachunek kontrahenta: 41 2130 0004 2001 9903 2278 6040|Nazwa i adres Kontrahenta: VW|Tytuł: FV 51101/0426/RM, FV 51100/0426/RM|Identyfikator transakcji: 66140506700049439";
  assert.equal(d(op), "FV 51101/0426/RM, FV 51100/0426/RM");
}

// Case B — brak Tytuł, jest Numer faktury
{
  const op =
    "Rachunek kontrahenta: 43 1160 2202 0000 0004 9624 0293|Nazwa i adres Kontrahenta: NETIA SA|Numer faktury: 2026/03/004|Identyfikator transakcji: 66070590200058541";
  assert.equal(d(op), "FV 2026/03/004");
}

// Case C — Numer faktury + Kwota VAT
{
  const op =
    "Rachunek kontrahenta: 43 1160 2202 0000 0004 9624 0293|Nazwa i adres Kontrahenta: NETIA|Numer faktury: 2026/03/004|Kwota VAT: 4 547,56 PLN|Identyfikator: 5833315322";
  assert.equal(d(op), "FV 2026/03/004 · VAT 4 547,56 PLN");
}

// Case D — brak Tytuł i Numer faktury → kontrahent (jak dotąd)
{
  const op =
    "Rachunek kontrahenta: 43 1160 2202 0000 0004 9624 0293|Nazwa i adres Kontrahenta: NETIA SPÓŁKA AKCYJNA UL POLECZKI 13 02-822 WARSZAWA|Identyfikator transakcji: 66070590200058541";
  assert.equal(d(op), "NETIA SPÓŁKA AKCYJNA UL POLECZKI 13 02-822 WARSZAWA");
}

// Integracja: pełny CSV iPKO (jeden wiersz)
{
  const csv = `Data operacji,Dane operacji,Kwota,Typ operacji
2026-04-17,"Rachunek kontrahenta: X|Numer faktury: 2026/03/004|Kwota VAT: 4 547,56 PLN",16410.76,Przelew Split`;
  const { rows, format } = parseBankStatementCsv(csv);
  assert.equal(format, "ipko-biznes");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.description, "FV 2026/03/004 · VAT 4 547,56 PLN");
  assert.ok(rows[0]!.dedupeRawMaterial.includes("Numer faktury"));
}

console.log("ipko-title-smoke: OK");
