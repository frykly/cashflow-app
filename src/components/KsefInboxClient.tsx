"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Spinner } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import type { KsefStatusResponse } from "@/lib/ksef/diagnostics";

type Row = {
  id: string;
  ksefId: string;
  source: string;
  status: string;
  documentType: string;
  issueDate: string;
  saleDate: string | null;
  sellerName: string;
  buyerName: string;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  importedAsCostInvoiceId: string | null;
  importedAsRevenueInvoiceId: string | null;
};

export function KsefInboxClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<KsefStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setMsg(null);
    const [docRes, stRes] = await Promise.all([
      fetch("/api/ksef/documents"),
      fetch("/api/ksef/status"),
    ]);
    const [j, st] = await Promise.all([docRes.json(), stRes.json()]);
    if (stRes.ok && st && typeof st === "object") {
      setStatus(st as KsefStatusResponse);
    } else {
      setStatus(null);
    }
    if (!docRes.ok) {
      setRows([]);
      setMsg({ type: "err", text: readApiErrorBody(j) });
      return;
    }
    setRows(Array.isArray(j) ? j : []);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function sync() {
    setMsg(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/ksef/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: readApiErrorBody(j) });
        return;
      }
      setMsg({
        type: "ok",
        text: `Sync: ${String(j.status)} — ${typeof j.upserted === "number" ? j.upserted : "?"} dokument(ów).`,
      });
      await load();
    } catch {
      setMsg({ type: "err", text: "Błąd sieci przy synchronizacji." });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">KSeF Inbox (staging)</h1>
        <Button type="button" onClick={() => void sync()} disabled={syncing || loading}>
          {syncing ? "Synchronizacja…" : "Sync KSeF"}
        </Button>
      </div>
      {status ? (
        <div
          className="rounded border border-neutral-200 bg-neutral-50/80 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900/50"
          aria-label="Status techniczny KSeF"
        >
          <p className="mb-2 font-medium text-neutral-700 dark:text-neutral-200">
            Diagnostyka (nie wpływa na dane biznesowe)
          </p>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Konfiguracja źródła</dt>
              <dd className="font-mono">{status.configuredDataSource}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Ostatni sync — źródło efektywne</dt>
              <dd className="font-mono">
                {status.lastSync?.effectiveSource ?? "—"}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">KSEF_ENABLED</dt>
              <dd className="font-mono">{status.ksefEnabled ? "true" : "false"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Token (KSEF_ACCESS_TOKEN)</dt>
              <dd className="font-mono">{status.tokenConfigured ? "yes" : "no"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Następny sync — HTTP API</dt>
              <dd className="font-mono">
                {status.willUseRealApiNextSync ? "yes" : "no"}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Fallback do stub (ostatni sukces)</dt>
              <dd className="font-mono">
                {status.lastSync?.fallbackToStub === true
                  ? "yes"
                  : status.lastSync?.fallbackToStub === false
                    ? "no"
                    : "—"}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2 sm:col-span-2 lg:col-span-3">
              <dt className="text-neutral-500">Ostatnia sesja — status</dt>
              <dd className="font-mono">
                {status.lastSync?.status ?? "brak sesji"}
              </dd>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <dt className="text-neutral-500">Ostatnia sesja — komunikat</dt>
              <dd className="mt-0.5 break-words text-neutral-800 dark:text-neutral-100">
                {status.lastSync?.message ?? "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : loading ? null : (
        <p className="text-sm text-neutral-500">Nie udało się pobrać statusu KSeF.</p>
      )}
      {msg?.type === "err" ? <Alert variant="error">{msg.text}</Alert> : null}
      {msg?.type === "ok" ? <Alert variant="info">{msg.text}</Alert> : null}
      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-700">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-900">
                <th className="p-2">Data wyst.</th>
                <th className="p-2">Typ</th>
                <th className="p-2">Sprzedawca</th>
                <th className="p-2">Nabywca</th>
                <th className="p-2 text-right">Netto</th>
                <th className="p-2 text-right">VAT</th>
                <th className="p-2 text-right">Brutto</th>
                <th className="p-2">Status</th>
                <th className="p-2">Źródło</th>
                <th className="p-2">Import</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800">
                  <td className="p-2 whitespace-nowrap">{r.issueDate?.slice(0, 10) ?? "—"}</td>
                  <td className="p-2">{r.documentType}</td>
                  <td className="p-2 max-w-[180px] truncate" title={r.sellerName}>
                    {r.sellerName}
                  </td>
                  <td className="p-2 max-w-[180px] truncate" title={r.buyerName}>
                    {r.buyerName}
                  </td>
                  <td className="p-2 text-right font-mono">{r.netAmount}</td>
                  <td className="p-2 text-right font-mono">{r.vatAmount}</td>
                  <td className="p-2 text-right font-mono">{r.grossAmount}</td>
                  <td className="p-2">{r.status}</td>
                  <td className="p-2">{r.source}</td>
                  <td className="p-2 text-xs">
                    {r.importedAsCostInvoiceId || r.importedAsRevenueInvoiceId ? "tak" : "nie"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="p-4 text-neutral-500">Brak dokumentów — uruchom „Sync KSeF”.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
