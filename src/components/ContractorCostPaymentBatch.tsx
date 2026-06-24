"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui";
import { decToNumber, round2 } from "@/lib/cashflow/money";
import { formatDate, formatMoney } from "@/lib/format";
import { costInvoiceListEditHref } from "@/lib/navigation/invoice-deep-links";
import { isSelectableCostInvoiceForTransfer } from "@/lib/payments/cost-invoice-payable";
import {
  buildTransferBundle,
  buildTransferTitles,
  copyTextToClipboard,
  formatTransferAmountPlain,
} from "@/lib/payments/transfer-clipboard";

export type ContractorCostInvoiceRow = {
  id: string;
  documentNumber: string;
  supplier: string;
  grossAmount: string;
  amountToPayGross: string | null;
  paymentGrossAmount: string;
  paidAmount: number;
  remainingAmount: number;
  documentDate: string;
  paymentDueDate: string | null;
  status: string;
};

function costStatusBadge(status: string) {
  if (status === "ZAPLACONA") return <Badge variant="success">Zapłacona</Badge>;
  if (status === "PARTIALLY_PAID") return <Badge variant="warning">Częściowo zapłacona</Badge>;
  if (status === "DO_ZAPLATY") return <Badge variant="warning">Do zapłaty</Badge>;
  return <Badge variant="muted">Planowana</Badge>;
}

const cardInteractive =
  "group flex-1 min-w-0 rounded-2xl px-4 py-3 text-left transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950";

const cardInvoice = `${cardInteractive} bg-zinc-50/80 hover:bg-zinc-100/90 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/65`;

export function ContractorCostPaymentBatch({
  contractorName,
  invoices,
}: {
  contractorName: string;
  invoices: ContractorCostInvoiceRow[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const payableIds = useMemo(
    () => new Set(invoices.filter((inv) => isSelectableCostInvoiceForTransfer(inv)).map((inv) => inv.id)),
    [invoices],
  );

  const selectedInvoices = useMemo(
    () => invoices.filter((inv) => selectedIds.has(inv.id) && payableIds.has(inv.id)),
    [invoices, selectedIds, payableIds],
  );

  const totals = useMemo(() => {
    const paymentSum = round2(
      selectedInvoices.reduce((s, inv) => s + decToNumber(inv.paymentGrossAmount), 0),
    );
    const remainingSum = round2(selectedInvoices.reduce((s, inv) => s + inv.remainingAmount, 0));
    return { paymentSum, remainingSum };
  }, [selectedInvoices]);

  function toggleInvoice(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCopy(kind: "titles" | "amount" | "bundle") {
    if (selectedInvoices.length === 0) return;
    const transferRows = selectedInvoices.map((inv) => ({
      documentNumber: inv.documentNumber,
      remainingAmount: inv.remainingAmount,
    }));
    const text =
      kind === "titles"
        ? buildTransferTitles(transferRows)
        : kind === "amount"
          ? formatTransferAmountPlain(totals.remainingSum)
          : buildTransferBundle(contractorName, transferRows);
    const ok = await copyTextToClipboard(text);
    setCopyMsg(
      ok
        ? kind === "titles"
          ? "Skopiowano tytuły przelewów."
          : kind === "amount"
            ? "Skopiowano sumę."
            : "Skopiowano paczkę do banku."
        : "Nie udało się skopiować do schowka.",
    );
  }

  if (invoices.length === 0) {
    return <p className="text-xs text-zinc-500 dark:text-zinc-500">Brak dopasowań.</p>;
  }

  return (
    <div className="space-y-2">
      {selectedIds.size > 0 ? (
        <div className="sticky top-2 z-10 rounded-xl border border-sky-200 bg-sky-50/95 p-3 shadow-sm backdrop-blur-sm dark:border-sky-900 dark:bg-sky-950/90">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-zinc-800 dark:text-zinc-200">
              <span className="font-medium">Zaznaczono: {selectedInvoices.length}</span>
              <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
              <span>
                Do zapłaty: <span className="font-medium tabular-nums">{formatMoney(totals.paymentSum)}</span>
              </span>
              <span className="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
              <span>
                Pozostało:{" "}
                <span className="font-semibold tabular-nums text-zinc-950 dark:text-zinc-50">
                  {formatMoney(totals.remainingSum)}
                </span>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => void handleCopy("titles")}>
                Kopiuj tytuły przelewów
              </Button>
              <Button type="button" variant="secondary" onClick={() => void handleCopy("amount")}>
                Kopiuj sumę
              </Button>
              <Button type="button" onClick={() => void handleCopy("bundle")}>
                Kopiuj paczkę do banku
              </Button>
            </div>
          </div>
          {copyMsg ? (
            <p className="mt-2 text-xs text-sky-800 dark:text-sky-200" role="status">
              {copyMsg}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {invoices.map((r) => {
          const selectable = payableIds.has(r.id);
          const selected = selectedIds.has(r.id);
          const paymentGross = decToNumber(r.paymentGrossAmount);
          const hasPaymentSplit =
            r.amountToPayGross != null &&
            Math.abs(decToNumber(r.amountToPayGross) - decToNumber(r.grossAmount)) > 0.02;
          const showPartialPaid = selectable && r.remainingAmount < paymentGross - 0.02;

          return (
            <div key={r.id} className="flex items-stretch gap-2">
              {selectable ? (
                <label className="flex shrink-0 cursor-pointer items-center px-1">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-zinc-300 dark:border-zinc-600"
                    checked={selected}
                    onChange={() => toggleInvoice(r.id)}
                    aria-label={`Zaznacz fakturę ${r.documentNumber}`}
                  />
                </label>
              ) : (
                <span className="w-6 shrink-0" aria-hidden />
              )}
              <Link href={costInvoiceListEditHref(r.id)} className={cardInvoice}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-zinc-900 dark:text-zinc-50">{r.documentNumber}</span>
                      {costStatusBadge(r.status)}
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="line-clamp-1">{r.supplier}</span>
                      <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
                      <span>{formatDate(r.documentDate)}</span>
                    </p>
                    {showPartialPaid ? (
                      <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                        Pozostało: {formatMoney(r.remainingAmount)}
                      </p>
                    ) : null}
                    {hasPaymentSplit ? (
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        Kwota faktury: {formatMoney(r.grossAmount)}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatMoney(r.paymentGrossAmount)}
                    </span>
                    {hasPaymentSplit ? (
                      <p className="mt-0.5 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                        do zapłaty
                      </p>
                    ) : null}
                  </div>
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      {payableIds.size > 0 ? (
        <p className="text-xs text-zinc-500">
          Zaznacz nieopłacone faktury, aby skopiować tytuły i kwotę przelewu.
        </p>
      ) : null}
    </div>
  );
}
