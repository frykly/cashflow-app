export const TRANSFER_PAYMENT_EPS = 0.02;

export function isSelectableCostInvoiceForTransfer(inv: {
  status: string;
  remainingAmount: number;
}): boolean {
  if (inv.status === "ZAPLACONA") return false;
  if (inv.remainingAmount <= TRANSFER_PAYMENT_EPS) return false;
  return true;
}
