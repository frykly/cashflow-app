"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { readApiErrorBody } from "@/lib/api-client";

type FlowRow = { kind: string; id: string; date: string; label: string; mainAmount: number };

function flowRowEditHref(r: FlowRow): string {
  if (r.kind === "income") return `/income-invoices?editIncome=${r.id}`;
  if (r.kind === "cost") return `/cost-invoices?editCost=${r.id}`;
  return `/planned-events?editPlanned=${r.id}`;
}

type OverdueIncome = {
  id: string;
  invoiceNumber: string;
  contractor: string;
  plannedIncomeDate: string;
  paymentDueDate: string;
  label: string;
};

type OverdueCost = {
  id: string;
  documentNumber: string;
  supplier: string;
  plannedPaymentDate: string;
  paymentDueDate: string;
  label: string;
};

type OverduePlanned = {
  id: string;
  title: string;
  type: string;
  plannedDate: string;
  label: string;
};

type CatRow = { categoryId: string | null; name: string; mainAmount: number };

type Dashboard = {
  balances: { main: number; vat: number; total: number };
  planned30: { plannedInflowTotal: number; plannedOutflowTotal: number };
  planned7: { plannedInflowTotal: number; plannedOutflowTotal: number };
  upcomingInflows: FlowRow[];
  upcomingOutflows: FlowRow[];
  upcomingInflows7: FlowRow[];
  upcomingOutflows7: FlowRow[];
  mainNegativeForecast: boolean;
  overdue: {
    count: number;
    incomes: OverdueIncome[];
    costs: OverdueCost[];
    planned: OverduePlanned[];
  };
  categoryBreakdown30: {
    income: CatRow[];
    expense: CatRow[];
  };
};

export function DashboardClient() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const r = await fetch("/api/dashboard");
      const j = await r.json();
      if (!r.ok) {
        setErr(readApiErrorBody(j));
        setData(null);
        return;
      }
      setData(j as Dashboard);
    } catch {
      setErr("Błąd sieci");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-3 text-zinc-500">
        <Spinner className="!size-5" />
        <span>Ładowanie…</span>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="space-y-4">
        <Alert variant="error">{err}</Alert>
        <Button type="button" onClick={() => load()}>
          Spróbuj ponownie
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500">Przegląd sald, terminów i planowanych ruchów na koncie głównym.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => load()} disabled={loading}>
            {loading ? <Spinner /> : "Odśwież"}
          </Button>
          <Link
            href="/forecast"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Prognoza
          </Link>
        </div>
      </div>

      {data.mainNegativeForecast && (
        <Alert variant="error">
          Uwaga: w horyzoncie ostrzeżenia prognozy saldo konta głównego spada poniżej zera. Sprawdź widok{" "}
          <Link href="/forecast" className="font-medium underline">
            Prognoza
          </Link>
          .
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium text-zinc-500">Konto główne</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatMoney(data.balances.main)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium text-zinc-500">Konto VAT</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatMoney(data.balances.vat)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium text-zinc-500">Łącznie</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {formatMoney(data.balances.total)}
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/40">
          <div className="text-sm font-medium text-amber-900 dark:text-amber-200">Po terminie (łącznie)</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums text-amber-950 dark:text-amber-50">{data.overdue.count}</div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <Link href="/income-invoices?overdue=1" className="font-medium text-amber-900 underline dark:text-amber-200">
              Przychody ({data.overdue.incomes.length})
            </Link>
            <Link href="/cost-invoices?overdue=1" className="font-medium text-amber-900 underline dark:text-amber-200">
              Koszty ({data.overdue.costs.length})
            </Link>
            <Link href="/planned-events?overdue=1" className="font-medium text-amber-900 underline dark:text-amber-200">
              Zdarzenia ({data.overdue.planned.length})
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium text-zinc-500">Planowane wpływy (7 dni, MAIN)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            +{formatMoney(data.planned7.plannedInflowTotal)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium text-zinc-500">Planowane wydatki (7 dni, MAIN)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-red-700 dark:text-red-400">
            −{formatMoney(data.planned7.plannedOutflowTotal)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium text-zinc-500">Planowane wpływy (30 dni, MAIN)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            +{formatMoney(data.planned30.plannedInflowTotal)}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-sm font-medium text-zinc-500">Planowane wydatki (30 dni, MAIN)</div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-red-700 dark:text-red-400">
            −{formatMoney(data.planned30.plannedOutflowTotal)}
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-200">Po terminie</h2>
        <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
          Nieopłacone / niezapłacone z datą wcześniejszą niż dziś albo zaplanowane zdarzenia z przeszłą datą.
        </p>
        {data.overdue.count === 0 ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Brak pozycji po terminie.</p>
        ) : (
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            <div>
              <div className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Faktury przychodowe</div>
              <ul className="space-y-2 text-sm">
                {data.overdue.incomes.length === 0 && <li className="text-zinc-500">—</li>}
                {data.overdue.incomes.map((i) => (
                  <li key={i.id} className="flex flex-col gap-0.5 border-b border-amber-200/60 pb-2 last:border-0 dark:border-amber-900/40">
                    <Link
                      href={`/income-invoices?editIncome=${i.id}`}
                      className="font-medium text-zinc-900 underline dark:text-zinc-100"
                    >
                      {i.label}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      plan. wpływ {formatDate(i.plannedIncomeDate)} · termin {formatDate(i.paymentDueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Faktury kosztowe</div>
              <ul className="space-y-2 text-sm">
                {data.overdue.costs.length === 0 && <li className="text-zinc-500">—</li>}
                {data.overdue.costs.map((c) => (
                  <li key={c.id} className="flex flex-col gap-0.5 border-b border-amber-200/60 pb-2 last:border-0 dark:border-amber-900/40">
                    <Link
                      href={`/cost-invoices?editCost=${c.id}`}
                      className="font-medium text-zinc-900 underline dark:text-zinc-100"
                    >
                      {c.label}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      plan. zapłata {formatDate(c.plannedPaymentDate)} · termin {formatDate(c.paymentDueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Planowane zdarzenia</div>
              <ul className="space-y-2 text-sm">
                {data.overdue.planned.length === 0 && <li className="text-zinc-500">—</li>}
                {data.overdue.planned.map((p) => (
                  <li key={p.id} className="flex flex-col gap-0.5 border-b border-amber-200/60 pb-2 last:border-0 dark:border-amber-900/40">
                    <Link
                      href={`/planned-events?editPlanned=${p.id}`}
                      className="font-medium text-zinc-900 underline dark:text-zinc-100"
                    >
                      {p.title}
                    </Link>
                    <span className="text-xs text-zinc-500">
                      {p.type === "INCOME" ? "Wpływ" : "Wydatek"} · {formatDate(p.plannedDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Najbliższe wpływy (7 dni)</h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {data.upcomingInflows7.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-zinc-500">Brak zaplanowanych wpływów w tym oknie.</li>
            )}
            {data.upcomingInflows7.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="text-sm">
                <Link
                  href={flowRowEditHref(r)}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{r.label}</div>
                    <div className="text-zinc-500">{formatDate(r.date)}</div>
                  </div>
                  <div className="shrink-0 tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                    +{formatMoney(r.mainAmount)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Najbliższe wydatki (7 dni)</h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {data.upcomingOutflows7.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-zinc-500">Brak zaplanowanych wydatków w tym oknie.</li>
            )}
            {data.upcomingOutflows7.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="text-sm">
                <Link
                  href={flowRowEditHref(r)}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{r.label}</div>
                    <div className="text-zinc-500">{formatDate(r.date)}</div>
                  </div>
                  <div className="shrink-0 tabular-nums font-medium text-red-700 dark:text-red-400">{formatMoney(r.mainAmount)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Najbliższe wpływy (30 dni)</h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {data.upcomingInflows.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-zinc-500">Brak zaplanowanych wpływów w tym oknie.</li>
            )}
            {data.upcomingInflows.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="text-sm">
                <Link
                  href={flowRowEditHref(r)}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{r.label}</div>
                    <div className="text-zinc-500">{formatDate(r.date)}</div>
                  </div>
                  <div className="shrink-0 tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                    +{formatMoney(r.mainAmount)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Najbliższe wydatki (30 dni)</h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {data.upcomingOutflows.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-zinc-500">Brak zaplanowanych wydatków w tym oknie.</li>
            )}
            {data.upcomingOutflows.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="text-sm">
                <Link
                  href={flowRowEditHref(r)}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-800/80"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{r.label}</div>
                    <div className="text-zinc-500">{formatDate(r.date)}</div>
                  </div>
                  <div className="shrink-0 tabular-nums font-medium text-red-700 dark:text-red-400">{formatMoney(r.mainAmount)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Przychody wg kategorii (30 dni, MAIN)</h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-2 font-semibold">Kategoria</th>
                  <th className="px-4 py-2 text-right font-semibold">Kwota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {data.categoryBreakdown30.income.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-zinc-500">
                      Brak danych w oknie.
                    </td>
                  </tr>
                ) : (
                  data.categoryBreakdown30.income.map((row, idx) => (
                    <tr key={`${row.categoryId ?? "none"}-${idx}`}>
                      <td className="px-4 py-2.5">{row.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-700 dark:text-emerald-400">
                        +{formatMoney(row.mainAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Koszty wg kategorii (30 dni, MAIN)</h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                <tr>
                  <th className="px-4 py-2 font-semibold">Kategoria</th>
                  <th className="px-4 py-2 text-right font-semibold">Kwota</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {data.categoryBreakdown30.expense.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-zinc-500">
                      Brak danych w oknie.
                    </td>
                  </tr>
                ) : (
                  data.categoryBreakdown30.expense.map((row, idx) => (
                    <tr key={`${row.categoryId ?? "none"}-${idx}`}>
                      <td className="px-4 py-2.5">{row.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-red-700 dark:text-red-400">
                        {formatMoney(row.mainAmount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
