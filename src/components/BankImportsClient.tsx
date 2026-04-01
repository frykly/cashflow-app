"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { formatPlnFromGrosze } from "@/lib/bank-import/format-pln";
import { safeFormatDate } from "@/lib/format";

/** Odpowiada API POST /api/bank-import (skippedDetails) */
type BankImportSkippedDetail = {
  csvLine: number;
  reason: "existing_in_database" | "duplicate_within_file";
  matchedKeyKind: "new" | "legacy" | null;
  fingerprintNew: string;
  fingerprintLegacy: string;
  amountGrosze: number;
  descriptionPreview: string;
  dedupeMaterialPreview: string;
  counterpartyPreview: string | null;
  decisionNote?: string;
  materialIdenticalToStored?: boolean;
  storedDedupeInputPreview?: string;
  matchedTransactionId?: string;
  matchedImportId?: string;
  duplicateOfCsvLine?: number;
};

type ImportRow = {
  id: string;
  fileName: string;
  createdAt: string;
  _count: { transactions: number };
};

export function BankImportsClient() {
  const router = useRouter();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [lastSkippedDetails, setLastSkippedDetails] = useState<BankImportSkippedDetail[] | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/bank-imports");
      if (!res.ok) {
        setError(await readApiError(res));
        setRows([]);
        return;
      }
      const data = (await res.json()) as ImportRow[];
      setRows(data);
    } catch {
      setError("Błąd sieci");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    setUploadMsg(null);
    setLastSkippedDetails(null);
    setError(null);
    const fd = new FormData(formEl);
    setUploading(true);
    try {
      const res = await fetch("/api/bank-import", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : await readApiError(res));
        return;
      }
      const n = typeof data?.transactionCount === "number" ? data.transactionCount : 0;
      const skipped = typeof data?.skippedDuplicates === "number" ? data.skippedDuplicates : 0;
      const pe = data?.parseErrors as { line: number; message: string }[] | undefined;
      const fmt = data?.format === "ipko-biznes" ? "iPKO Biznes" : null;
      const fmtHint = fmt ? `Wykryto format ${fmt}. ` : "";
      const dupHint = skipped > 0 && !data?.message ? ` Pominięto ${skipped} duplikatów.` : "";
      const errLines =
        pe?.length ?
          ` Pominięte lub błędne wiersze (${pe.length}): ${pe
            .slice(0, 5)
            .map((x) => `wiersz ${x.line}: ${x.message}`)
            .join("; ")}${pe.length > 5 ? "…" : ""}.`
        : "";
      const apiMsg = typeof data?.message === "string" && data.message.trim() ? data.message.trim() : null;
      const summary =
        apiMsg ?
          `${fmtHint}${apiMsg}`
        : `${fmtHint}Zaimportowano ${n} transakcji.${dupHint}`;
      setUploadMsg(`${summary}${errLines}`);
      const sd = data?.skippedDetails;
      setLastSkippedDetails(Array.isArray(sd) ? (sd as BankImportSkippedDetail[]) : null);
      await load();
      router.refresh();
      formEl?.reset?.();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Import bankowy</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Wyciąg CSV — uzgodnienie z ruchem na koncie (bez automatycznego księgowania).
        </p>
      </div>

      <form onSubmit={onUpload} className="flex max-w-xl flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <label className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Plik CSV</label>
        <input
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          className="text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-200 file:px-3 file:py-1.5 file:text-sm dark:file:bg-zinc-700"
        />
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-zinc-600 dark:text-zinc-400">Konto</span>
            <select name="accountType" defaultValue="MAIN" className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950">
              <option value="MAIN">MAIN</option>
              <option value="VAT">VAT</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-zinc-600 dark:text-zinc-400">Waluta</span>
            <input name="currency" defaultValue="PLN" maxLength={8} className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950" />
          </label>
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="w-fit rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {uploading ? "Import…" : "Importuj"}
        </button>
        {uploadMsg ? <p className="text-sm text-emerald-700 dark:text-emerald-400">{uploadMsg}</p> : null}
      </form>

      {lastSkippedDetails && lastSkippedDetails.length > 0 ? (
        <section className="max-w-5xl space-y-3 rounded-lg border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
          <h2 className="text-base font-semibold text-amber-950 dark:text-amber-100">Pominięte rekordy (diagnostyka)</h2>
          <p className="text-sm text-amber-900/90 dark:text-amber-200/90">
            Poniżej wiersze uznane za duplikaty lub powtórzenia w pliku — sprawdź powód i ewentualne powiązanie z istniejącą
            transakcją.
          </p>
          <div className="overflow-x-auto rounded-md border border-amber-200/80 dark:border-amber-900/50">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-amber-200 bg-amber-100/80 dark:border-amber-800 dark:bg-amber-900/50">
                <tr>
                  <th className="px-2 py-2 font-medium">Wiersz CSV</th>
                  <th className="px-2 py-2 font-medium">Kwota</th>
                  <th className="px-2 py-2 font-medium">Opis / materiał dedupl.</th>
                  <th className="px-2 py-2 font-medium">Powód</th>
                  <th className="px-2 py-2 font-medium">Klucz</th>
                  <th className="px-2 py-2 font-medium">Dopasowanie</th>
                </tr>
              </thead>
              <tbody>
                {lastSkippedDetails.map((row, idx) => {
                  const txLink =
                    row.matchedImportId && row.matchedTransactionId ?
                      `/bank-imports/${row.matchedImportId}/transactions/${row.matchedTransactionId}`
                    : null;
                  return (
                    <tr
                      key={`${row.csvLine}-${idx}`}
                      className="border-b border-amber-100/90 align-top dark:border-amber-900/40"
                    >
                      <td className="px-2 py-2 tabular-nums">{row.csvLine}</td>
                      <td className="px-2 py-2 whitespace-nowrap tabular-nums">{formatPlnFromGrosze(row.amountGrosze)}</td>
                      <td className="px-2 py-2 text-zinc-800 dark:text-zinc-200">
                        <div className="max-w-md font-mono text-[11px] leading-snug">
                          <span className="text-zinc-500 dark:text-zinc-400">opis: </span>
                          {row.descriptionPreview}
                        </div>
                        <div className="mt-1 max-w-md font-mono text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                          <span className="text-zinc-500">dedupe: </span>
                          {row.dedupeMaterialPreview}
                        </div>
                        {row.counterpartyPreview ? (
                          <div className="mt-1 text-[11px] text-zinc-500">Kontrahent: {row.counterpartyPreview}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{row.reason}</div>
                        {row.reason === "duplicate_within_file" && row.duplicateOfCsvLine != null ? (
                          <div className="mt-1 text-[11px]">Powtórzenie wiersza {row.duplicateOfCsvLine}</div>
                        ) : null}
                        {row.reason === "existing_in_database" ? (
                          <div className="mt-1 space-y-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                            {row.materialIdenticalToStored === true ? (
                              <div>Materiał z CSV = zapisany w bazie (dedupeInputText).</div>
                            ) : row.materialIdenticalToStored === false ? (
                              <div>Materiał różni się od zapisu — sprawdź notatkę poniżej.</div>
                            ) : null}
                            {row.storedDedupeInputPreview ? (
                              <div className="max-w-xs break-words">
                                W bazie (skrót): <span className="font-mono">{row.storedDedupeInputPreview}</span>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 font-mono text-[10px] text-zinc-600 dark:text-zinc-400">
                        <div>matchedKeyKind: {row.matchedKeyKind ?? "—"}</div>
                        <div className="mt-1 break-all" title={row.fingerprintNew}>
                          fp: {row.fingerprintNew.slice(0, 28)}…
                        </div>
                        <div className="mt-1 break-all" title={row.fingerprintLegacy}>
                          leg: {row.fingerprintLegacy.slice(0, 28)}…
                        </div>
                      </td>
                      <td className="px-2 py-2 text-[11px]">
                        {txLink ? (
                          <Link href={txLink} className="text-blue-600 underline hover:no-underline dark:text-blue-400">
                            Istniejąca transakcja
                          </Link>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                        {row.matchedTransactionId ? (
                          <div className="mt-1 font-mono text-[10px] text-zinc-500">id: {row.matchedTransactionId}</div>
                        ) : null}
                        {row.matchedImportId ? (
                          <div className="font-mono text-[10px] text-zinc-500">import: {row.matchedImportId}</div>
                        ) : null}
                        {row.decisionNote ? (
                          <div className="mt-2 border-t border-amber-200/80 pt-2 text-zinc-700 dark:text-zinc-300">
                            {row.decisionNote}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-medium text-zinc-900 dark:text-zinc-100">Lista importów</h2>
        {!rows ? (
          <p className="text-zinc-500">Ładowanie…</p>
        ) : rows.length === 0 ? (
          <p className="text-zinc-500">Brak importów.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
                <tr>
                  <th className="px-3 py-2 font-medium">Data importu</th>
                  <th className="px-3 py-2 font-medium">Plik</th>
                  <th className="px-3 py-2 font-medium">Transakcje</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/80">
                    <td className="px-3 py-2 whitespace-nowrap">{safeFormatDate(r.createdAt)}</td>
                    <td className="px-3 py-2">{r.fileName}</td>
                    <td className="px-3 py-2 tabular-nums">{r._count.transactions}</td>
                    <td className="px-3 py-2">
                      <Link href={`/bank-imports/${r.id}`} className="text-blue-600 hover:underline dark:text-blue-400">
                        Szczegóły
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
