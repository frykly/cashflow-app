"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { formatMoney, safeFormatDayKey } from "@/lib/format";
import { readApiErrorBody } from "@/lib/api-client";
import { hrefForForecastMovement } from "@/lib/forecast-movement-link";

type Movement = {
  kind: string;
  label: string;
  mainDelta: number;
  vatDelta: number;
  refId?: string;
};

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
};

export function ForecastClient() {
  const init = initialRange();
  const [fromYmd, setFromYmd] = useState(init.from);
  const [toYmd, setToYmd] = useState(init.to);
  /** Wartości w polach dat — aktualizowane przy każdym znaku; fetch dopiero po zatwierdzeniu (blur / Enter). */
  const [fromDraft, setFromDraft] = useState(init.from);
  const [toDraft, setToDraft] = useState(init.to);
  const [preset, setPreset] = useState<Preset>(30);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const qs = new URLSearchParams({ from: fromYmd, to: toYmd });
        const r = await fetch(`/api/forecast?${qs.toString()}`);
        const j = await r.json();
        if (!r.ok) throw new Error(readApiErrorBody(j));
        if (!cancelled) {
          setRows(j.rows ?? []);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Błąd");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromYmd, toYmd, refreshTick]);

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
    const floor =
      isValidYmd(fromDraft) && fromDraft > fromYmd ? fromDraft : fromYmd;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Prognoza cashflow</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-500">
            Zakres od–do (domyślnie od 1. dnia miesiąca). Prognoza odświeża się po zatwierdzeniu daty (klik poza pole,
            zamknięcie kalendarza lub Enter) — nie przy każdej cyfrze. Skróty 30/60/90 ustawiają „Do daty”. Kliknij
            wiersz, aby rozwinąć zdarzenia. Ujemne saldo MAIN jest podświetlone.
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={loading}
          >
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
        <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2.5 font-semibold dark:bg-zinc-900">Data</th>
                <th className="px-3 py-2.5 font-semibold">MAIN pocz.</th>
                <th className="px-3 py-2.5 font-semibold">VAT pocz.</th>
                <th className="px-3 py-2.5 font-semibold">MAIN +</th>
                <th className="px-3 py-2.5 font-semibold">MAIN −</th>
                <th className="px-3 py-2.5 font-semibold">VAT +</th>
                <th className="px-3 py-2.5 font-semibold">VAT −</th>
                <th className="px-3 py-2.5 font-semibold">MAIN kon.</th>
                <th className="px-3 py-2.5 font-semibold">VAT kon.</th>
                <th className="px-3 py-2.5 font-semibold">Łącznie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {rows.map((r) => {
                const neg = r.mainEnd < 0;
                return (
                  <Fragment key={r.dayKey}>
                    <tr
                      className={`cursor-pointer transition-colors ${
                        neg
                          ? "bg-red-50 hover:bg-red-100/80 dark:bg-red-950/30 dark:hover:bg-red-950/50"
                          : "bg-white hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/80"
                      }`}
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
                      <td className="sticky left-0 z-10 whitespace-nowrap border-r border-zinc-100 bg-inherit px-3 py-2 font-medium dark:border-zinc-800">
                        {safeFormatDayKey(r.dayKey)}
                        <span className="ml-2 text-zinc-400">{expanded === r.dayKey ? "▼" : "▶"}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{formatMoney(r.mainStart)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMoney(r.vatStart)}</td>
                      <td className="px-3 py-2 tabular-nums text-emerald-700 dark:text-emerald-400">
                        {r.mainInflows > 0 ? formatMoney(r.mainInflows) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-red-700 dark:text-red-400">
                        {r.mainOutflows < 0 ? formatMoney(r.mainOutflows) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-emerald-700 dark:text-emerald-400">
                        {r.vatInflows > 0 ? formatMoney(r.vatInflows) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-red-700 dark:text-red-400">
                        {r.vatOutflows < 0 ? formatMoney(r.vatOutflows) : "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums font-semibold">{formatMoney(r.mainEnd)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMoney(r.vatEnd)}</td>
                      <td className="px-3 py-2 tabular-nums font-medium">{formatMoney(r.totalEnd)}</td>
                    </tr>
                    {expanded === r.dayKey && (
                      <tr className={neg ? "bg-red-50/90 dark:bg-red-950/20" : "bg-zinc-50 dark:bg-zinc-900/50"}>
                        <td colSpan={10} className="px-3 py-3 text-xs text-zinc-600 dark:text-zinc-400">
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
