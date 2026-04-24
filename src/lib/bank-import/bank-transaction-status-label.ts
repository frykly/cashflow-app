/**
 * Etykiety UI dla statusów BankTransaction (wartości w bazie bez zmian).
 */
const LABELS: Record<string, string> = {
  IGNORED: "Pominięte",
  LINKED_INCOME: "Powiązane z przychodem",
  LINKED_COST: "Powiązane z kosztem",
  VAT_TOPUP: "VAT (techniczne)",
  UNMATCHED: "Do przypisania",
  MATCHED: "Dopasowane",
  PARTIAL: "Częściowo dopasowane",
  NEW: "Nowe",
  LINKED_OTHER_INCOME: "Inny przychód (wyciąg)",
  CREATED: "Powiązane (legacy)",
  TRANSFER: "Przelew",
  DUPLICATE: "Duplikat",
  BROKEN_LINK: "Powiązanie do weryfikacji",
};

export function bankTransactionStatusLabel(status: string): string {
  return LABELS[status] ?? "Inny status";
}
