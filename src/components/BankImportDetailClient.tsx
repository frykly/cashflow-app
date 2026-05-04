"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { formatPlnFromGrosze } from "@/lib/bank-import/format-pln";
import { bankTransactionStatusLabel } from "@/lib/bank-import/bank-transaction-status-label";
import { safeFormatDate } from "@/lib/format";
import { BankTransactionMatchModal } from "@/components/BankTransactionMatchModal";
import { CreateCostFromBankModal } from "@/components/CreateCostFromBankModal";
import { costInvoiceListEditHref, incomeInvoiceListEditHref } from "@/lib/navigation/invoice-deep-links";
import type { BankImportSkippedDetail } from "@/lib/bank-import/import-skipped-types";
import { bankImportSkippedReasonLabel } from "@/lib/bank-import/skipped-reason-label";

type Tx = {
  id: string;
  bookingDate: string;
  amount: number;
  currency: string;
  description: string;
  accountType: string;
  status: string;
  matchedInvoiceId: string | null;
  linkedCostInvoiceId: string | null;
  createdCostId: string | null;
  allocation?: {
    allocatedPln: string;
    remainingPln: string;
    fullyAssigned: boolean;
    partiallyAssigned: boolean;
  };
};

type Detail = {
  id: string;
  fileName: string;
  createdAt: string;
  skippedLinesJson?: unknown;
  transactions: Tx[];
};

function parseSkippedLines(raw: unknown): BankImportSkippedDetail[] {
  if (!Array.isArray(raw)) return [];
  return raw as BankImportSkippedDetail[];
}

const statusClass: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  MATCHED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  LINKED_COST: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  LINKED_INCOME: "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200",
  LINKED_OTHER_INCOME: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
  PARTIAL: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  CREATED: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  IGNORED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
  TRANSFER: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  VAT_TOPUP: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  DUPLICATE: "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  BROKEN_LINK: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

function canCreateCost(t: Tx): boolean {
  if (t.linkedCostInvoiceId) return false;
  if (t.status === "LINKED_COST" && t.createdCostId) return false;
  if (["VAT_TOPUP", "DUPLICATE", "IGNORED", "LINKED_OTHER_INCOME"].includes(t.status)) return false;
  return true;
}

function showMatchButton(t: Tx): boolean {
  return !["DUPLICATE", "IGNORED", "LINKED_OTHER_INCOME"].includes(t.status);
}

export function BankImportDetailClient({ importId }: { importId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [matchTx, setMatchTx] = useState<{
    id: string;
    amount: number;
    description: string;
    accountType: string;
  } | null>(null);
  const [costModalTxId, setCostModalTxId] = useState<string | null>(null);
  const [importDeleteBusy, setImportDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/bank-imports/${importId}`);
    if (!res.ok) {
      setError(await readApiError(res));
      return;
    }
    setData((await res.json()) as Detail);
  }, [importId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function afterMutation() {
    await load();
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/bank-transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      await afterMutation();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteWholeImport() {
    if (
      !window.confirm(
        "Usuniesz import i wszystkie jego transakcje. Te dane znikną z listy importów. Czy kontynuować?",
      )
    ) {
      return;
    }
    setImportDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bank-imports/${importId}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      router.push("/bank-imports");
      router.refresh();
    } finally {
      setImportDeleteBusy(false);
    }
  }

  async function unlink(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/bank-transactions/${id}/unlink`, { method: "POST" });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      await afterMutation();
    } finally {
      setBusyId(null);
    }
  }

  if (!data && !error) {
    return <p className="text-zinc-500">Ładowanie…</p>;
  }
  if (error && !data) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        {error}
      </p>
    );
  }
  if (!data) return null;

  const skippedRows = parseSkippedLines(data.skippedLinesJson);

  return (
    <div className="space-y-6">
      <BankTransactionMatchModal
        transactionId={matchTx?.id ?? ""}
        transactionAmountGrosze={matchTx?.amount ?? 0}
        transactionDescription={matchTx?.description ?? ""}
        transactionAccountType={matchTx?.accountType ?? "MAIN"}
        open={matchTx !== null}
        onClose={() => setMatchTx(null)}
        onLinked={() => void afterMutation()}
      />

      <CreateCostFromBankModal
        transactionId={costModalTxId}
        open={costModalTxId !== null}
        onClose={() => setCostModalTxId(null)}
        onCreated={() => void afterMutation()}
      />

      <div className="flex flex-wrap items-baseline gap-4">
        <Link href="/bank-imports" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Importy
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{data.fileName}</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Import: {safeFormatDate(data.createdAt)} · {data.transactions.length} transakcji
          </p>
        </div>
        <button
          type="button"
          disabled={importDeleteBusy}
          onClick={() => void deleteWholeImport()}
          className="shrink-0 rounded-md border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-900 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:bg-zinc-950 dark:text-rose-200 dark:hover:bg-rose-950/40"
        >
          {importDeleteBusy ? "Usuwanie…" : "Usuń import"}
        </button>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[780px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
            <tr>
              <th className="px-2 py-2 font-medium">Data</th>
              <th className="px-2 py-2 font-medium">Opis</th>
              <th className="px-2 py-2 font-medium">Kwota</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Szczegóły / akcje</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t) => {
              const b = busyId === t.id;
              const displayStatus = t.allocation?.partiallyAssigned ? "PARTIAL" : t.status;
              const sc = statusClass[displayStatus] ?? statusClass.NEW;
              const createOk = canCreateCost(t);
              const costEditTargetId = t.linkedCostInvoiceId ?? t.createdCostId;
              return (
                <tr key={t.id} className="border-b border-zinc-100 align-top dark:border-zinc-800/80">
                  <td className="px-2 py-2 whitespace-nowrap">{safeFormatDate(t.bookingDate)}</td>
                  <td className="px-2 py-2 max-w-[280px] break-words">{t.description}</td>
                  <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                    {formatPlnFromGrosze(t.amount)} {t.currency !== "PLN" ? t.currency : ""}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${sc}`}>
                      {t.allocation?.partiallyAssigned ? "Częściowo przypisano" : bankTransactionStatusLabel(t.status)}
                    </span>
                    {t.allocation ? (
                      <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                        przypisano: {t.allocation.allocatedPln} zł
                        <br />
                        pozostało:{" "}
                        <span className={t.allocation.partiallyAssigned ? "font-medium text-amber-800 dark:text-amber-200" : ""}>
                          {t.allocation.remainingPln} zł
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex max-w-[420px] flex-wrap gap-1">
                      <Link
                        href={`/bank-imports/${importId}/transactions/${t.id}`}
                        className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                      >
                        Szczegóły
                      </Link>
                      {showMatchButton(t) ? (
                        <button
                          type="button"
                          disabled={b}
                          onClick={() =>
                            setMatchTx({
                              id: t.id,
                              amount: t.amount,
                              description: t.description,
                              accountType: t.accountType,
                            })
                          }
                          className="rounded border border-emerald-600 bg-white px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                        >
                          Dopasuj do istniejącego dokumentu
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={b || !createOk}
                        onClick={() => setCostModalTxId(t.id)}
                        className="rounded border border-blue-300 bg-white px-2 py-1 text-xs text-blue-900 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:bg-zinc-950 dark:text-blue-200 dark:hover:bg-blue-950/40"
                        title={!createOk ? "Powiązanie z kosztem już istnieje lub status blokuje" : undefined}
                      >
                        Utwórz nowy koszt
                      </button>
                      <button
                        type="button"
                        disabled={b}
                        onClick={() => void setStatus(t.id, "IGNORED")}
                        className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                      >
                        Ignoruj
                      </button>
                      <button
                        type="button"
                        disabled={b}
                        onClick={() => void unlink(t.id)}
                        className="rounded border border-rose-300 bg-white px-2 py-1 text-xs text-rose-900 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:bg-zinc-950 dark:text-rose-200 dark:hover:bg-rose-950/40"
                      >
                        Cofnij
                      </button>
                      {t.matchedInvoiceId ? (
                        <Link
                          href={incomeInvoiceListEditHref(t.matchedInvoiceId)}
                          title={t.matchedInvoiceId}
                          className="inline-flex items-center rounded px-2 py-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Przychód
                        </Link>
                      ) : null}
                      {costEditTargetId ? (
                        <Link
                          href={costInvoiceListEditHref(costEditTargetId)}
                          title={[t.linkedCostInvoiceId, t.createdCostId].filter(Boolean).join(" ")}
                          className="inline-flex items-center rounded px-2 py-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Koszty
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Pominięte przy imporcie</h2>
        {skippedRows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {data.skippedLinesJson == null ?
              "Brak zapisanej historii pominiętych wierszy (np. import sprzed aktualizacji systemu albo brak pominięć przy tym imporcie)."
            : "Przy tym imporcie nie pominięto żadnych wierszy."}
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Wiersze uznane za duplikaty lub pominięte z innego powodu — zapis z momentu importu.
            </p>
            <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-zinc-200 bg-zinc-100/80 dark:border-zinc-800 dark:bg-zinc-900/80">
                  <tr>
                    <th className="px-2 py-2 font-medium">Wiersz CSV</th>
                    <th className="px-2 py-2 font-medium">Data</th>
                    <th className="px-2 py-2 font-medium">Kwota</th>
                    <th className="px-2 py-2 font-medium">Opis</th>
                    <th className="px-2 py-2 font-medium">Powód</th>
                    <th className="px-2 py-2 font-medium">Dopasowanie</th>
                    <th className="px-2 py-2 font-medium">Szczegóły</th>
                  </tr>
                </thead>
                <tbody>
                  {skippedRows.map((row, idx) => {
                    const txLink =
                      row.matchedImportId && row.matchedTransactionId ?
                        `/bank-imports/${row.matchedImportId}/transactions/${row.matchedTransactionId}`
                      : null;
                    return (
                      <tr
                        key={`${row.csvLine}-${idx}`}
                        className="border-b border-zinc-100 align-top dark:border-zinc-800/80"
                      >
                        <td className="px-2 py-2 tabular-nums">{row.csvLine}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          {row.bookingDate ? safeFormatDate(row.bookingDate) : "—"}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                          {formatPlnFromGrosze(row.amountGrosze)}
                        </td>
                        <td className="px-2 py-2 max-w-[280px] break-words text-zinc-800 dark:text-zinc-200">
                          {row.descriptionPreview}
                          {row.counterpartyPreview ? (
                            <div className="mt-1 text-[11px] text-zinc-500">Kontrahent: {row.counterpartyPreview}</div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-zinc-800 dark:text-zinc-200">
                            {bankImportSkippedReasonLabel(row.reason)}
                          </div>
                          {row.reason === "duplicate_within_file" && row.duplicateOfCsvLine != null ? (
                            <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                              Jak wiersz {row.duplicateOfCsvLine} w tym pliku
                            </div>
                          ) : null}
                          {row.reason === "existing_in_database" && row.materialIdenticalToStored === false ? (
                            <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                              Możliwa kolizja legacy — sprawdź szczegóły techniczne.
                            </div>
                          ) : null}
                          {row.reason === "legacy_strong_match" ? (
                            <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                              Dopasowanie po dacie, kwocie, opisie i kontrahencie (fallback). Nie używane dla
                              generycznych opłat/prowizji bankowych — tam obowiązuje wyłącznie fingerprint z materiału
                              banku.
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2 text-[11px]">
                          {txLink ?
                            <Link
                              href={txLink}
                              className="text-blue-600 underline hover:no-underline dark:text-blue-400"
                            >
                              Istniejąca transakcja
                            </Link>
                          : <span className="text-zinc-400">—</span>}
                        </td>
                        <td className="px-2 py-2">
                          <details className="text-[11px] text-zinc-600 dark:text-zinc-400">
                            <summary className="cursor-pointer text-blue-600 hover:underline dark:text-blue-400">
                              Techniczne
                            </summary>
                            <div className="mt-2 space-y-1 border-t border-zinc-200 pt-2 font-mono text-[10px] dark:border-zinc-700">
                              <div className="break-all">
                                <span className="text-zinc-500">fingerprint: </span>
                                {row.fingerprintNew}
                              </div>
                              <div className="break-all">
                                <span className="text-zinc-500">fingerprint legacy: </span>
                                {row.fingerprintLegacy}
                              </div>
                              {row.matchedKeyKind ?
                                <div>
                                  matchedKeyKind: {row.matchedKeyKind}
                                </div>
                              : null}
                              {row.dedupeMaterialPreview ?
                                <div className="break-words">
                                  <span className="text-zinc-500">materiał dedupl.: </span>
                                  {row.dedupeMaterialPreview}
                                </div>
                              : null}
                              {row.decisionNote ?
                                <div className="text-zinc-700 dark:text-zinc-300">{row.decisionNote}</div>
                              : null}
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
