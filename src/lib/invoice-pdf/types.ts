import type { VatRatePct } from "@/lib/vat-rate";

/** Wynik parsowania tekstu z PDF (bez zapisu do bazy). */
export type InvoicePdfParsedValues = {
  documentNumber?: string;
  invoiceNumber?: string;
  supplier?: string;
  contractor?: string;
  description?: string;
  /** Data wystawienia / dokumentu */
  documentDate?: string;
  issueDate?: string;
  paymentDueDate?: string;
  netAmount?: string;
  vatAmount?: string;
  grossAmount?: string;
  vatRate?: VatRatePct;
};

export type InvoicePdfDraftResponse = {
  warnings: string[];
  /** Klucze techniczne pól, które zostały ustawione (np. documentNumber) */
  filledFieldKeys: string[];
  /** Krótkie etykiety do podświetlenia w UI */
  filledLabels: string[];
  values: InvoicePdfParsedValues;
  /** Informacyjnie: ile znaków tekstu z PDF */
  textLength: number;
};
