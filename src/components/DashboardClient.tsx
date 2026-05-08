"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Spinner } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { readApiErrorBody } from "@/lib/api-client";
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/projects/project-task-ui";

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

type OperationalOverdueTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  assigneeName: string | null;
  priority: string | null;
  plannedEndDate: string;
  daysOverdue: number;
};

type OperationalTodayTask = {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  status: string;
  assigneeName: string | null;
};

type OperationalAttentionProject = {
  id: string;
  name: string;
  lifecycleStatus: string | null;
  settlementStatus: string | null;
  lifecycleLabel: string;
  settlementLabel: string;
  overdueTaskCount: number;
  activeMissingCount: number;
};

type OperationalStaleProject = {
  id: string;
  name: string;
  lifecycleStatus: string | null;
  settlementStatus: string | null;
  lifecycleLabel: string;
  settlementLabel: string;
  lastActivityAt: string;
};

type Operational = {
  overdueTasks: OperationalOverdueTask[];
  overdueTasksTotalCount: number;
  todayTasks: OperationalTodayTask[];
  attentionProjects: OperationalAttentionProject[];
  staleProjects: OperationalStaleProject[];
};

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
  operational: Operational;
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
          <p className="mt-1 text-sm text-zinc-500">
            Przegląd sald, terminów i planowanych ruchów — oraz skrót operacyjny: zadania i projekty wymagające reakcji.
          </p>
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

      {data.operational ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Centrum operacyjne</h2>
            <p className="mt-1 text-sm text-zinc-500">Co dziś wymaga uwagi — zadania, terminy i projekty.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col rounded-xl border border-red-200/80 bg-gradient-to-b from-red-50/90 to-white p-4 shadow-sm dark:border-red-900/45 dark:from-red-950/35 dark:to-zinc-950">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">Zaległe zadania</h3>
                {data.operational.overdueTasksTotalCount > 0 ? (
                  <Badge variant="danger">{data.operational.overdueTasksTotalCount}</Badge>
                ) : null}
              </div>
              {data.operational.overdueTasks.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Brak zaległych zadań z terminem.</p>
              ) : (
                <ul className="mt-3 flex flex-1 flex-col gap-2">
                  {data.operational.overdueTasks.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-lg border border-red-100/80 bg-white/80 px-3 py-2 dark:border-red-900/30 dark:bg-zinc-900/40"
                    >
                      <div className="flex flex-wrap items-center gap-1.5 gap-y-0.5">
                        <Link
                          href={`/projects/${t.projectId}`}
                          className="min-w-0 flex-1 font-medium text-zinc-900 underline decoration-red-900/20 underline-offset-2 dark:text-zinc-100"
                        >
                          {t.title}
                        </Link>
                        {t.priority ? (
                          <Badge variant={t.priority === "HIGH" ? "danger" : "default"}>
                            {PRIORITY_LABEL[t.priority] ?? t.priority}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        <Link href={`/projects/${t.projectId}`} className="font-medium text-red-800 hover:underline dark:text-red-300">
                          {t.projectName}
                        </Link>
                        <span className="text-zinc-400"> · </span>
                        <span className="font-medium tabular-nums text-red-700 dark:text-red-400">
                          {t.daysOverdue} {t.daysOverdue === 1 ? "dzień" : "dni"} po terminie
                        </span>
                        {t.assigneeName ? (
                          <>
                            <span className="text-zinc-400"> · </span>
                            {t.assigneeName}
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {data.operational.overdueTasksTotalCount > data.operational.overdueTasks.length ? (
                <Link
                  href="/tasks?view=overdue"
                  className="mt-3 text-sm font-medium text-red-800 underline underline-offset-2 hover:text-red-950 dark:text-red-300"
                >
                  Zobacz wszystkie zadania ({data.operational.overdueTasksTotalCount})
                </Link>
              ) : (
                <Link
                  href="/tasks?view=overdue"
                  className="mt-3 text-sm font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  Lista zadań — zaległe
                </Link>
              )}
            </div>

            <div className="flex flex-col rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/80 to-white p-4 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:to-zinc-950">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">Na dziś</h3>
                {data.operational.todayTasks.length > 0 ? (
                  <Badge variant="warning">{data.operational.todayTasks.length}</Badge>
                ) : null}
              </div>
              {data.operational.todayTasks.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Brak otwartych zadań zaplanowanych na dziś.</p>
              ) : (
                <ul className="mt-3 flex flex-1 flex-col gap-2">
                  {data.operational.todayTasks.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-lg border border-amber-100/90 bg-white/80 px-3 py-2 dark:border-amber-900/25 dark:bg-zinc-900/40"
                    >
                      <Link
                        href={`/projects/${t.projectId}`}
                        className="font-medium text-zinc-900 underline decoration-amber-800/20 underline-offset-2 dark:text-zinc-100"
                      >
                        {t.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                        <span>{t.projectName}</span>
                        <Badge variant="muted">
                          {TASK_STATUS_LABEL[t.status] ?? t.status}
                        </Badge>
                        {t.assigneeName ? <span>Odp.: {t.assigneeName}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/tasks?view=today"
                className="mt-3 text-sm font-medium text-amber-900/90 underline underline-offset-2 hover:text-amber-950 dark:text-amber-200"
              >
                Wszystkie zadania na dziś
              </Link>
              <Link
                href="/calendar"
                className="mt-1 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              >
                Kalendarz
              </Link>
            </div>

            <div className="flex flex-col rounded-xl border border-sky-200/80 bg-gradient-to-b from-sky-50/70 to-white p-4 shadow-sm dark:border-sky-900/40 dark:from-sky-950/25 dark:to-zinc-950">
              <h3 className="text-sm font-semibold text-sky-900 dark:text-sky-200">Projekty wymagające uwagi</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Status realizacji (DO_WYJASNIENIA, OCZEKIWANIE*, BLOKADA*), braki lub zaległe zadania.
              </p>
              {data.operational.attentionProjects.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Brak projektów spełniających te kryteria.</p>
              ) : (
                <ul className="mt-3 flex flex-1 flex-col gap-2">
                  {data.operational.attentionProjects.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-lg border border-sky-100/80 bg-white/80 px-3 py-2 dark:border-sky-900/25 dark:bg-zinc-900/40"
                    >
                      <Link href={`/projects/${p.id}`} className="font-medium text-zinc-900 underline dark:text-zinc-100">
                        {p.name}
                      </Link>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">Realizacja: {p.lifecycleLabel}</span>
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 dark:bg-zinc-800">Rozliczenie: {p.settlementLabel}</span>
                        {p.overdueTaskCount > 0 ? (
                          <Badge variant="danger">
                            Zaległe zadania: {p.overdueTaskCount}
                          </Badge>
                        ) : null}
                        {p.activeMissingCount > 0 ? (
                          <Badge variant="warning">
                            Braki: {p.activeMissingCount}
                          </Badge>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/projects"
                className="mt-3 text-sm font-medium text-sky-800 underline underline-offset-2 dark:text-sky-300"
              >
                Wszystkie projekty
              </Link>
            </div>

            <div className="flex flex-col rounded-xl border border-zinc-200 bg-gradient-to-b from-zinc-50/80 to-white p-4 shadow-sm dark:border-zinc-700 dark:from-zinc-900/40 dark:to-zinc-950">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Cisza operacyjna (14 dni)</h3>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Aktywne projekty (bez „Zakończony”), bez zapisów: zadania, faktury (w tym alokacje), zdarzenia planowane,
                inne przychody — oraz aktualizacja karty projektu; ostatnia aktywność starsza niż 14 dni.
              </p>
              {data.operational.staleProjects.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Brak takich projektów.</p>
              ) : (
                <ul className="mt-3 flex flex-1 flex-col gap-2">
                  {data.operational.staleProjects.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-lg border border-zinc-200/80 bg-white/90 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50"
                    >
                      <Link href={`/projects/${p.id}`} className="font-medium text-zinc-900 underline dark:text-zinc-100">
                        {p.name}
                      </Link>
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Ostatnia aktywność: <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{formatDate(p.lastActivityAt)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                        <span>{p.lifecycleLabel}</span>
                        <span className="text-zinc-300 dark:text-zinc-600">·</span>
                        <span>{p.settlementLabel}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      ) : null}

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
