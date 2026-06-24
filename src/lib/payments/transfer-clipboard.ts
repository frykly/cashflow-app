import { round2 } from "@/lib/cashflow/money";

export type TransferClipboardInvoice = {
  documentNumber: string;
  remainingAmount: number;
};

/** Kwota do wklejenia w banku: 5303,20 */
export function formatTransferAmountPlain(amount: number): string {
  return round2(amount).toFixed(2).replace(".", ",");
}

export function buildTransferTitles(invoices: TransferClipboardInvoice[]): string {
  return invoices
    .map((inv) => inv.documentNumber.trim())
    .filter(Boolean)
    .join("; ");
}

export function buildTransferBundle(contractorName: string, invoices: TransferClipboardInvoice[]): string {
  const titles = buildTransferTitles(invoices);
  const sum = round2(invoices.reduce((s, inv) => s + inv.remainingAmount, 0));
  return [
    `Tytuł: ${titles}`,
    `Kwota: ${formatTransferAmountPlain(sum)} PLN`,
    `Kontrahent: ${contractorName.trim()}`,
  ].join("\n");
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
