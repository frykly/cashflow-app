"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { decToNumber } from "@/lib/cashflow/money";
import { formatMoney, safeFormatDate } from "@/lib/format";
import type { OtherIncomeListRow } from "@/lib/other-income-api";
import { Spinner } from "@/components/ui";

export function OtherIncomeListClient() {
  const [items, setItems] = useState<OtherIncomeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/other-income");
      if (!res.ok) {
        setError(await readApiError(res));
        setItems([]);
        return;
      }
      const data = (await res.json()) as { items: OtherIncomeListRow[] };
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Pozostałe przychody</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Przychody poza fakturami (np. z importu bankowego lub wpisane ręcznie). Nie są widoczne w module faktur przychodowych.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ?
        <div className="flex items-center gap-2 text-zinc-500">
          <Spinner className="!size-5" />
          Ładowanie…
        </div>
      : items.length === 0 ?
        <p className="text-sm text-zinc-500">Brak wpisów.</p>
      : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[880px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Opis</th>
                <th className="px-3 py-2 font-medium tabular-nums">Brutto</th>
                <th className="px-3 py-2 font-medium tabular-nums">VAT</th>
                <th className="px-3 py-2 font-medium tabular-nums">MAIN</th>
                <th className="px-3 py-2 font-medium">Projekt</th>
                <th className="px-3 py-2 font-medium">Kategoria</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const gross = decToNumber(r.amountGross);
                const vat = decToNumber(r.vatAmount);
                const main = gross - vat;
                return (
                  <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/80">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link
                        href={`/other-income/${r.id}`}
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {safeFormatDate(r.date)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 max-w-[280px]">
                      <Link href={`/other-income/${r.id}`} className="break-words text-blue-600 hover:underline dark:text-blue-400">
                        {r.description || "—"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(r.amountGross)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(r.vatAmount)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(main)}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.projectName ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.categoryName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
