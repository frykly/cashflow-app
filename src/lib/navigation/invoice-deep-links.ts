/** Lista kosztów / przychodów — otwiera modal edycji konkretnej faktury (istniejący mechanizm w *InvoicesClient). */

export function costInvoiceListEditHref(costInvoiceId: string): string {
  return `/cost-invoices?editCost=${encodeURIComponent(costInvoiceId)}`;
}

export function incomeInvoiceListEditHref(incomeInvoiceId: string): string {
  return `/income-invoices?editIncome=${encodeURIComponent(incomeInvoiceId)}`;
}
