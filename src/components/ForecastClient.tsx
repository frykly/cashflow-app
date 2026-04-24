"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { formatMoney, safeFormatDayKey } from "@/lib/format";
import { readApiError, readApiErrorBody } from "@/lib/api-client";
import { hrefForForecastMovement } from "@/lib/forecast-movement-link";

function startOfCurrentMonthYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Dodaje n dni kalendarzowych do `yyyy-MM-dd` (strefa lokalna). */
function addCalendarDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

type Preset = 30 | 60 | 90 | "custom";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidYmd(s: string): boolean {
  if (!YMD_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function initialRange(): { from: string; to: string } {
  const from = startOfCurrentMonthYmd();
  return { from, to: addCalendarDaysYmd(from, 30) };
}

type Movement = {
  kind: string;
  label: string;
  mainDelta: number;
  vatDelta: number;
  refId?: string;
};

type Row = {
  dayKey: string;
  mainStart: number;
  vatStart: number;
  mainInflows: number;
  mainOutflows: number;
  vatInflows: number;
  vatOutflows: number;
  mainEnd: number;
  vatEnd: number;
  totalEnd: number;
  movements: Movement[];
  dayCashSettled: boolean;
  settlementProgress?: { done: number; total: number };
};

type ReconRow = {
  dayKey: string;
  status: string;
  mainBankBalance: string;
  vatBankBalance: string;
  note: string;
  mainChecked: boolean;
  vatChecked: boolean;
};

export function ForecastClient() {
  const init = initialRange();
  const [fromYmd, setFromYmd] = useState(init.from);
  const [toYmd, setToYmd] = useState(init.to);
  const [fromDraft, setFromDraft] = useState(init.from);
  const [toDraft, setToDraft] = useState(init.to);
  const [preset, setPreset] = useState<Preset>(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [reconByDay, setReconByDay] = useState<Record<string, ReconRow>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [ackBusyDay, setAckBusyDay] = useState<string | null>(null);

  const mergeReconItems = useCallback((items: ReconRow[]) => {
    const m: Record<string, ReconRow> = {};
    for (const it of items) {
      m[it.dayKey] = it;
    }
    setReconByDay(m);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const qs = new URLSearchParams({ from: fromYmd, to: toYmd });
        const [rFore, rRec] = await Promise.all([
          fetch(`/api/forecast?${qs.toString()}`),
          fetch(`/api/daily-cash-reconciliations?${qs.toString()}`),
        ]);
        const jFore = await rFore.json();
        if (!rFore.ok) throw new Error(readApiErrorBody(jFore));
        const jRec = await rRec.json();
        if (!rRec.ok) throw new Error(readApiErrorBody(jRec));
        if (!cancelled) {
          const rawRows = (jFore.rows ?? []) as Row[];
          setRows(rawRows.map((r) => ({ ...r, dayCashSettled: r.dayCashSettled !== false })));
          mergeReconItems((jRec.items ?? []) as ReconRow[]);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Błąd");
          setRows([]);
          setReconByDay({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromYmd, toYmd, refreshTick, mergeReconItems]);

  function commitFromDraft() {
    const next = fromDraft;
    if (!isValidYmd(next)) {
      setFromDraft(fromYmd);
      return;
    }
    setFromYmd(next);
    if (toYmd < next) {
      setToYmd(next);
      setToDraft(next);
    }
    setPreset("custom");
  }

  function commitToDraft() {
    const next = toDraft;
    if (!isValidYmd(next)) {
      setToDraft(toYmd);
      return;
    }
    const floor = isValidYmd(fromDraft) && fromDraft > fromYmd ? fromDraft : fromYmd;
    if (next < floor) {
      setToDraft(toYmd);
      return;
    }
    setToYmd(next);
    setPreset("custom");
  }

  function toggleExpand(dayKey: string) {
    setExpanded((k) => (k === dayKey ? null : dayKey));
  }

  async function patchAck(dayKey: string, patch: { mainChecked?: boolean; vatChecked?: boolean }) {
    setAckBusyDay(dayKey);
    setErr(null);
    try {
      const res = await fetch("/api/daily-cash-reconciliations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayKey, ...patch }),
      });
      if (!res.ok) {
        setErr(await readApiError(res));
        return;
      }
      const j = (await res.json()) as { item: ReconRow };
      setReconByDay((prev) => ({ ...prev, [j.item.dayKey]: j.item }));
    } finally {
      setAckBusyDay(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Prognoza cashflow</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-500">
            Zakres od–do (domyślnie od 1. dnia miesiąca). Odświeżenie po zatwierdzeniu daty (blur / Enter). Skróty 30/60/90
            ustawiają „Do daty”. Kliknij wiersz, aby rozwinąć zdarzenia.{" "}
            <strong className="font-medium text-zinc-700 dark:text-zinc-300">Kolor dnia</strong> (automatyczny): zielony
            — wszystkie pozycje dnia rozliczone lub brak ruchów; czerwony — jest nierozliczona pozycja (wg faktur, planów
            i powiązań z bankiem). Checkboxy MAIN/VAT to tylko Twoja notatka z wyciągu —{" "}
            <strong className="font-medium">nie zmieniają</strong> koloru dnia. Czerwony wykrzyknik przy MAIN/VAT
            ostrzega tylko o ujemnym saldzie końcowym tego konta — osobno od koloru wiersza.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="whitespace-nowrap">Od daty</span>
            <input
              type="date"
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
              onBlur={commitFromDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={loading}
            />
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="whitespace-nowrap">Do daty</span>
            <input
              type="date"
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              value={toDraft}
              min={fromDraft}
              onChange={(e) => setToDraft(e.target.value)}
              onBlur={commitToDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              disabled={loading}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {([30, 60, 90] as const).map((d) => (
              <Button
                key={d}
                type="button"
                variant={preset === d ? "primary" : "secondary"}
                onClick={() => {
                  const nextTo = addCalendarDaysYmd(fromYmd, d);
                  setToYmd(nextTo);
                  setToDraft(nextTo);
                  setPreset(d);
                }}
                disabled={loading}
              >
                {d} dni
              </Button>
            ))}
            <Button type="button" variant="secondary" onClick={() => setRefreshTick((t) => t + 1)} disabled={loading}>
              {loading ? <Spinner /> : "Odśwież"}
            </Button>
            <span className="text-xs text-zinc-500">Eksport:</span>
            <a
              className="text-sm text-zinc-800 underline dark:text-zinc-200"
              href={`/api/forecast/export?format=csv&from=${encodeURIComponent(fromYmd)}&to=${encodeURIComponent(toYmd)}`}
            >
              CSV
            </a>
            <a
              className="text-sm text-zinc-800 underline dark:text-zinc-200"
              href={`/api/forecast/export?format=xlsx&from=${encodeURIComponent(fromYmd)}&to=${encodeURIComponent(toYmd)}`}
            >
              Excel
            </a>
          </div>
        </div>
      </div>

      {err && <Alert variant="error">{err}</Alert>}

      {loading && rows.length === 0 ? (
        <div className="flex items-center gap-3 text-zinc-500">
          <Spinner className="!size-5" />
          Ładowanie…
        </div>
      ) : (
        <div className="max-w-full overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
          <table className="w-full table-fixed border-collapse text-left text-[11px] sm:text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="sticky left-0 z-10 w-[5.5rem] bg-zinc-50 px-1 py-2 font-semibold dark:bg-zinc-900">Dzień</th>
                <th className="px-0.5 py-2 font-semibold" title="Wpływy MAIN">
                  M+
                </th>
                <th className="px-0.5 py-2 font-semibold" title="Wypływy MAIN">
                  M−
                </th>
                <th className="px-0.5 py-2 font-semibold" title="Wpływy VAT">
                  V+
                </th>
                <th className="px-0.5 py-2 font-semibold" title="Wypływy VAT">
                  V−
                </th>
                <th className="px-0.5 py-2 font-semibold" title="Koniec MAIN">
                  M kon
                </th>
                <th className="px-0.5 py-2 font-semibold" title="Koniec VAT">
                  V kon
                </th>
                <th className="px-0.5 py-2 font-semibold" title="Łącznie">
                  Σ
                </th>
                <th className="px-0.5 py-2 font-semibold" title="Potwierdzenie zgodności z wyciągiem (nie wpływa na kolor)">
                  Bank
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((r) => {
                const gaps = !r.dayCashSettled;
                const negMain = r.mainEnd < 0;
                const negVat = r.vatEnd < 0;
                const trCls = gaps
                  ? "cursor-pointer bg-rose-50/90 hover:bg-rose-100/90 dark:bg-rose-950/30 dark:hover:bg-rose-950/45"
                  : "cursor-pointer bg-emerald-50/50 hover:bg-emerald-100/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/35";
                const dotTitle = gaps ? "Braki rozliczeń" : "Rozliczone";
                const rec = reconByDay[r.dayKey];
                const ackBusy = ackBusyDay === r.dayKey;
                return (
                  <Fragment key={r.dayKey}>
                    <tr
                      className={trCls}
                      onClick={() => toggleExpand(r.dayKey)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleExpand(r.dayKey);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-expanded={expanded === r.dayKey}
                    >
                      <td className="sticky left-0 z-10 border-r border-zinc-100 bg-inherit px-1 py-1.5 font-medium dark:border-zinc-800">
                        <div className="flex items-center gap-1">
                          <span
                            className={`inline-block size-2 shrink-0 rounded-full ${gaps ? "bg-rose-600" : "bg-emerald-600"}`}
                            title={dotTitle}
                            aria-hidden
                          />
                          <span className="min-w-0 leading-tight">
                            {safeFormatDayKey(r.dayKey)}
                            <span className="ml-0.5 text-zinc-400">{expanded === r.dayKey ? "▼" : "▶"}</span>
                          </span>
                        </div>
                      </td>
                      <td className="px-0.5 py-1.5 tabular-nums text-emerald-800 dark:text-emerald-300">
                        {r.mainInflows > 0 ? formatMoney(r.mainInflows) : "—"}
                      </td>
                      <td className="px-0.5 py-1.5 tabular-nums text-red-800 dark:text-red-300">
                        {r.mainOutflows < 0 ? formatMoney(r.mainOutflows) : "—"}
                      </td>
                      <td className="px-0.5 py-1.5 tabular-nums text-emerald-800 dark:text-emerald-300">
                        {r.vatInflows > 0 ? formatMoney(r.vatInflows) : "—"}
                      </td>
                      <td className="px-0.5 py-1.5 tabular-nums text-red-800 dark:text-red-300">
                        {r.vatOutflows < 0 ? formatMoney(r.vatOutflows) : "—"}
                      </td>
                      <td
                        className={`px-0.5 py-1.5 tabular-nums font-semibold ${
                          negMain ? "font-bold text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {formatMoney(r.mainEnd)}
                      </td>
                      <td
                        className={`px-0.5 py-1.5 tabular-nums ${
                          negVat ? "font-bold text-red-600 dark:text-red-400" : "text-zinc-900 dark:text-zinc-100"
                        }`}
                      >
                        {formatMoney(r.vatEnd)}
                      </td>
                      <td className="px-0.5 py-1.5 tabular-nums font-medium">{formatMoney(r.totalEnd)}</td>
                      <td
                        className="px-0.5 py-1 align-middle"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex flex-col gap-1 text-[10px] leading-tight">
                          <label className="flex cursor-pointer items-center gap-1">
                            <input
                              type="checkbox"
                              checked={!!rec?.mainChecked}
                              disabled={ackBusy}
                              onChange={(e) => {
                                e.stopPropagation();
                                void patchAck(r.dayKey, { mainChecked: e.target.checked });
                              }}
                            />
                            <span>MAIN</span>
                            {negMain ?
                              <span
                                className="inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[11px] font-black leading-none text-white shadow-sm ring-2 ring-red-200 dark:bg-red-500 dark:ring-red-900/60"
                                title="Ujemne saldo MAIN"
                                aria-label="Ujemne saldo MAIN"
                              >
                                !
                              </span>
                            : null}
                          </label>
                          <label className="flex cursor-pointer items-center gap-1">
                            <input
                              type="checkbox"
                              checked={!!rec?.vatChecked}
                              disabled={ackBusy}
                              onChange={(e) => {
                                e.stopPropagation();
                                void patchAck(r.dayKey, { vatChecked: e.target.checked });
                              }}
                            />
                            <span>VAT</span>
                            {negVat ?
                              <span
                                className="inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-[11px] font-black leading-none text-white shadow-sm ring-2 ring-red-200 dark:bg-red-500 dark:ring-red-900/60"
                                title="Ujemne saldo VAT"
                                aria-label="Ujemne saldo VAT"
                              >
                                !
                              </span>
                            : null}
                          </label>
                        </div>
                      </td>
                    </tr>
                    {expanded === r.dayKey && (
                      <tr className={gaps ? "bg-rose-50/95 dark:bg-rose-950/25" : "bg-zinc-50 dark:bg-zinc-900/50"}>
                        <td colSpan={9} className="px-2 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                          <p className="mb-1 tabular-nums">
                            Początek dnia: MAIN {formatMoney(r.mainStart)} · VAT {formatMoney(r.vatStart)}
                            {gaps ?
                              <span className="ml-2 font-medium text-rose-800 dark:text-rose-200">· Braki rozliczeń</span>
                            : null}
                          </p>
                          <p className="mb-2 text-zinc-700 dark:text-zinc-300">
                            Zrealizowano {r.settlementProgress?.done ?? 0}/{r.settlementProgress?.total ?? 0}
                          </p>
                          {r.movements.length === 0 ? (
                            <span className="italic">Brak ruchów tego dnia.</span>
                          ) : (
                            <ul className="list-inside list-disc space-y-1">
                              {r.movements.map((m, i) => {
                                const href = hrefForForecastMovement({
                                  kind: m.kind,
                                  refId: m.refId ?? "",
                                });
                                const body = (
                                  <>
                                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{m.label}</span>
                                    {" — "}
                                    <span className="tabular-nums">
                                      MAIN {m.mainDelta >= 0 ? "+" : ""}
                                      {formatMoney(m.mainDelta)}, VAT {m.vatDelta >= 0 ? "+" : ""}
                                      {formatMoney(m.vatDelta)}
                                    </span>
                                    {!href && (
                                      <span className="ml-1 text-zinc-400 italic dark:text-zinc-500">(brak linku)</span>
                                    )}
                                  </>
                                );
                                return (
                                  <li key={`${m.kind}-${m.refId ?? ""}-${i}`}>
                                    {href ? (
                                      <Link
                                        href={href}
                                        className="-mx-1 block rounded-md px-1 py-0.5 text-left text-inherit no-underline transition-colors hover:bg-zinc-100 hover:underline dark:hover:bg-zinc-800"
                                      >
                                        {body}
                                      </Link>
                                    ) : (
                                      <span className="block">{body}</span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
