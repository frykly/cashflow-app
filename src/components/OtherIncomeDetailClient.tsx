"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { decToNumber } from "@/lib/cashflow/money";
import { formatMoney, safeFormatDate } from "@/lib/format";
import type { OtherIncomeListRow } from "@/lib/other-income-api";
import { Button, Spinner } from "@/components/ui";

type Props = { id: string };

export function OtherIncomeDetailClient({ id }: Props) {
  const router = useRouter();
  const [row, setRow] = useState<OtherIncomeListRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/other-income/${id}`);
    if (!res.ok) {
      setError(await readApiError(res));
      setRow(null);
      return;
    }
    setRow((await res.json()) as OtherIncomeListRow);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete() {
    if (!row) return;
    if (!window.confirm("Usunąć ten przychód bez faktury? Jeśli pochodzi z importu bankowego, transakcja wróci do statusu NEW.")) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/other-income/${row.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      router.push("/other-income");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  if (error && !row) {
    return (
      <div className="space-y-4">
        <Link href="/other-income" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Lista
        </Link>
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Spinner className="!size-5" />
        Ładowanie…
      </div>
    );
  }

  const gross = decToNumber(row.amountGross);
  const vat = decToNumber(row.vatAmount);
  const main = gross - vat;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-4">
        <Link href="/other-income" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Pozostałe przychody
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Szczegóły</h1>
        <p className="mt-1 text-sm text-zinc-500">Przychód bez faktury — tylko podgląd (edycja w kolejnej iteracji).</p>
      </div>

      {error ?
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      : null}

      <div className="max-w-xl space-y-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
          <div className="text-xs font-medium uppercase text-zinc-500">Data</div>
          <div>{safeFormatDate(row.date)}</div>
          <div className="text-xs font-medium uppercase text-zinc-500">Opis</div>
          <div className="whitespace-pre-wrap break-words">{row.description || "—"}</div>
          <div className="text-xs font-medium uppercase text-zinc-500">Brutto</div>
          <div className="tabular-nums">{formatMoney(row.amountGross)}</div>
          <div className="text-xs font-medium uppercase text-zinc-500">VAT</div>
          <div className="tabular-nums">{formatMoney(row.vatAmount)}</div>
          <div className="text-xs font-medium uppercase text-zinc-500">MAIN (brutto − VAT)</div>
          <div className="tabular-nums">{formatMoney(main)}</div>
          <div className="text-xs font-medium uppercase text-zinc-500">Projekt</div>
          <div>{row.projectName ?? "—"}</div>
          <div className="text-xs font-medium uppercase text-zinc-500">Kategoria</div>
          <div>{row.categoryName ?? "—"}</div>
          <div className="text-xs font-medium uppercase text-zinc-500">Źródło</div>
          <div>{row.source === "bank_import" ? "Import bankowy" : "Ręczny"}</div>
          {row.bankTransactionId ?
            <>
              <div className="text-xs font-medium uppercase text-zinc-500">Transakcja bankowa</div>
              <div>
                {row.bankImportId ?
                  <Link
                    href={`/bank-imports/${row.bankImportId}/transactions/${row.bankTransactionId}`}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                    title={row.bankTransactionId}
                  >
                    Otwórz w imporcie
                  </Link>
                : (
                  <span className="font-mono text-xs text-zinc-500" title={row.bankTransactionId}>
                    {row.bankTransactionId.slice(0, 8)}…
                  </span>
                )}
              </div>
            </>
          : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="danger" disabled={deleting} onClick={() => void handleDelete()}>
          {deleting ? "Usuwanie…" : "Usuń"}
        </Button>
      </div>
    </div>
  );
}
