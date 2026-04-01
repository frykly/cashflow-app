"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { formatPlnFromGrosze } from "@/lib/bank-import/format-pln";
import { safeFormatDate } from "@/lib/format";

type Tx = {
  id: string;
  bookingDate: string;
  amount: number;
  currency: string;
  description: string;
  status: string;
  createdCostId: string | null;
};

type Detail = {
  id: string;
  fileName: string;
  createdAt: string;
  transactions: Tx[];
};

const statusClass: Record<string, string> = {
  NEW: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  MATCHED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  IGNORED: "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300",
  CREATED: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  TRANSFER: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
};

export function BankImportDetailClient({ importId }: { importId: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  async function setStatus(id: string, status: Tx["status"]) {
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
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function createCost(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/bank-transactions/${id}/create-cost`, { method: "POST" });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      await load();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-4">
        <Link href="/bank-imports" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Importy
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{data.fileName}</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Import: {safeFormatDate(data.createdAt)} · {data.transactions.length} transakcji
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
            <tr>
              <th className="px-2 py-2 font-medium">Data</th>
              <th className="px-2 py-2 font-medium">Opis</th>
              <th className="px-2 py-2 font-medium">Kwota</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {data.transactions.map((t) => {
              const b = busyId === t.id;
              const sc = statusClass[t.status] ?? statusClass.NEW;
              return (
                <tr key={t.id} className="border-b border-zinc-100 align-top dark:border-zinc-800/80">
                  <td className="px-2 py-2 whitespace-nowrap">{safeFormatDate(t.bookingDate)}</td>
                  <td className="px-2 py-2 max-w-[280px] break-words">{t.description}</td>
                  <td className="px-2 py-2 tabular-nums whitespace-nowrap">
                    {formatPlnFromGrosze(t.amount)} {t.currency !== "PLN" ? t.currency : ""}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${sc}`}>{t.status}</span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={b}
                        onClick={() => void setStatus(t.id, "MATCHED")}
                        className="rounded border border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-800 dark:bg-zinc-950 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                      >
                        Dopasowane
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
                        onClick={() => void setStatus(t.id, "TRANSFER")}
                        className="rounded border border-violet-300 bg-white px-2 py-1 text-xs text-violet-900 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:bg-zinc-950 dark:text-violet-200 dark:hover:bg-violet-950/40"
                      >
                        Transfer
                      </button>
                      <button
                        type="button"
                        disabled={b || !!t.createdCostId}
                        onClick={() => void createCost(t.id)}
                        className="rounded border border-blue-300 bg-white px-2 py-1 text-xs text-blue-900 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:bg-zinc-950 dark:text-blue-200 dark:hover:bg-blue-950/40"
                      >
                        Koszt
                      </button>
                      {t.createdCostId ? (
                        <Link
                          href="/cost-invoices"
                          title={t.createdCostId}
                          className="inline-flex items-center rounded px-2 py-1 text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Lista kosztów
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
    </div>
  );
}
