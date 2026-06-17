"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import type { KsefStatusResponse } from "@/lib/ksef/diagnostics";
import type { KsefDocumentDirection, KsefWorkflowStatus } from "@/lib/ksef/types";

type Row = {
  id: string;
  ksefId: string;
  source: string;
  workflowStatus: KsefWorkflowStatus;
  documentDirection: KsefDocumentDirection;
  documentType: string;
  invoiceNumber: string;
  issueDate: string;
  saleDate: string | null;
  paymentDueDate: string | null;
  sellerName: string;
  sellerTaxId: string;
  buyerName: string;
  buyerTaxId: string;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  duplicateOfCostInvoiceId: string | null;
  duplicateMatchSummary: string | null;
  importedAsCostInvoiceId: string | null;
  rejectedAt: string | null;
  importedAt: string | null;
};

type DirectionTab = "PURCHASE" | "SALE" | "UNKNOWN";
type WorkflowFilter = "" | KsefWorkflowStatus;

const DIRECTION_TABS: { id: DirectionTab; label: string }[] = [
  { id: "PURCHASE", label: "Kosztowe" },
  { id: "SALE", label: "Przychodowe" },
  { id: "UNKNOWN", label: "Nieznane" },
];

function workflowBadge(status: KsefWorkflowStatus) {
  if (status === "NEW") return <Badge variant="default">Nowy</Badge>;
  if (status === "PROBABLE_DUPLICATE") return <Badge variant="warning">Duplikat</Badge>;
  if (status === "IMPORTED") return <Badge variant="success">Zaimportowany</Badge>;
  return <Badge variant="muted">Odrzucony</Badge>;
}

function directionLabel(dir: KsefDocumentDirection) {
  if (dir === "PURCHASE") return "Zakup";
  if (dir === "SALE") return "Sprzedaż";
  return "Nieznane";
}

export function KsefInboxClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<KsefStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [directionTab, setDirectionTab] = useState<DirectionTab>("PURCHASE");
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>("");
  const [syncFrom, setSyncFrom] = useState("");

  const needsInitialSyncFrom = status?.needsInitialSyncFrom ?? false;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ direction: directionTab });
    if (workflowFilter) params.set("workflow", workflowFilter);

    const [docRes, stRes] = await Promise.all([
      fetch(`/api/ksef/documents?${params}`),
      fetch("/api/ksef/status"),
    ]);
    const [j, st] = await Promise.all([docRes.json(), stRes.json()]);
    if (stRes.ok && st && typeof st === "object") {
      const stTyped = st as KsefStatusResponse;
      setStatus(stTyped);
      setSyncFrom((prev) => prev || stTyped.initialSyncFrom || "");
    } else {
      setStatus(null);
    }
    if (!docRes.ok) {
      setRows([]);
      setMsg({ type: "err", text: readApiErrorBody(j) });
      return;
    }
    const list = Array.isArray(j) ? (j as Row[]) : [];
    setRows(list);
    setSelectedId((prev) => (prev && list.some((r) => r.id === prev) ? prev : null));
  }, [directionTab, workflowFilter]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function sync() {
    if (needsInitialSyncFrom && !syncFrom.trim()) {
      setMsg({
        type: "err",
        text: "Ustaw datę „Pobieraj od” przed pierwszą synchronizacją.",
      });
      return;
    }

    setMsg(null);
    setSyncing(true);
    try {
      const body = needsInitialSyncFrom ? { syncFrom: syncFrom.trim() } : {};
      const res = await fetch("/api/ksef/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
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

  async function runAction(id: string, action: "import-cost" | "mark-duplicate" | "reject" | "restore") {
    setActingId(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/ksef/documents/${id}/${action}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: readApiErrorBody(j) });
        return;
      }
      setMsg({ type: "ok", text: `Akcja wykonana.` });
      await load();
    } catch {
      setMsg({ type: "err", text: "Błąd sieci przy akcji na dokumencie." });
    } finally {
      setActingId(null);
    }
  }

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const ws = selected?.workflowStatus;
  const dir = selected?.documentDirection;
  const canImportCost =
    selected &&
    dir === "PURCHASE" &&
    ws === "NEW";
  const importBlockedReason =
    selected && ws !== "IMPORTED" && ws !== "REJECTED" && dir !== "PURCHASE"
      ? "Import kosztu dostępny tylko dla dokumentów zakupowych. Ustaw KSEF_COMPANY_TAX_ID w .env albo poczekaj na poprawną klasyfikację po kolejnym sync."
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">KSeF</h1>
          <p className="text-sm text-zinc-500">Skrzynka dokumentów — workflow kosztów z KSeF.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {needsInitialSyncFrom ? (
            <Field label="Pobieraj od">
              <Input
                type="date"
                value={syncFrom}
                onChange={(e) => setSyncFrom(e.target.value)}
                aria-required
              />
            </Field>
          ) : null}
          <Button
            type="button"
            onClick={() => void sync()}
            disabled={syncing || loading || (needsInitialSyncFrom && !syncFrom.trim())}
          >
            {syncing ? "Synchronizacja…" : "Odśwież KSeF"}
          </Button>
        </div>
      </div>

      {needsInitialSyncFrom ? (
        <Alert variant="info">
          Pierwsza synchronizacja — wybierz datę „Pobieraj od”, potem kliknij „Odśwież KSeF”.
        </Alert>
      ) : null}

      {status && !status.companyTaxIdConfigured ? (
        <Alert variant="info">
          Brak KSEF_COMPANY_TAX_ID — dokumenty mogą trafiać do zakładki „Nieznane”. Możesz je
          nadal przeglądać, odrzucać i oznaczać jako duplikat.
        </Alert>
      ) : null}

      {status ? (
        <div
          className="rounded border border-neutral-200 bg-neutral-50/80 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900/50"
          aria-label="Status techniczny KSeF"
        >
          <p className="mb-2 font-medium text-neutral-700 dark:text-neutral-200">Diagnostyka</p>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Źródło</dt>
              <dd className="font-mono">{status.configuredDataSource}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">NIP firmy (env)</dt>
              <dd className="font-mono">{status.companyTaxIdConfigured ? "tak" : "nie"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Pobieraj od</dt>
              <dd className="font-mono">{status.initialSyncFrom ?? "—"}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Ostatni zakres</dt>
              <dd className="font-mono text-xs">
                {status.lastSync?.syncRangeFrom && status.lastSync?.syncRangeTo
                  ? `${status.lastSync.syncRangeFrom.slice(0, 10)} → ${status.lastSync.syncRangeTo.slice(0, 10)}`
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {msg?.type === "err" ? <Alert variant="error">{msg.text}</Alert> : null}
      {msg?.type === "ok" ? <Alert variant="info">{msg.text}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-2 dark:border-zinc-800">
        {DIRECTION_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setDirectionTab(t.id);
              setSelectedId(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              directionTab === t.id
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto min-w-[180px]">
          <Select
            value={workflowFilter}
            onChange={(e) => setWorkflowFilter(e.target.value as WorkflowFilter)}
          >
            <option value="">Wszystkie statusy</option>
            <option value="NEW">Nowe</option>
            <option value="PROBABLE_DUPLICATE">Prawdop. duplikaty</option>
            <option value="IMPORTED">Zaimportowane</option>
            <option value="REJECTED">Odrzucone</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-700">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-900">
                  <th className="p-2">Data</th>
                  <th className="p-2">Numer</th>
                  <th className="p-2">Sprzedawca</th>
                  <th className="p-2 text-right">Brutto</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`cursor-pointer border-b border-neutral-100 dark:border-neutral-800 ${
                      selectedId === r.id
                        ? "bg-zinc-100 dark:bg-zinc-800/60"
                        : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    }`}
                    onClick={() => setSelectedId(r.id)}
                  >
                    <td className="p-2 whitespace-nowrap">{r.issueDate?.slice(0, 10) ?? "—"}</td>
                    <td className="p-2 font-mono text-xs">{r.invoiceNumber || "—"}</td>
                    <td className="p-2 max-w-[200px] truncate" title={r.sellerName}>
                      {r.sellerName}
                    </td>
                    <td className="p-2 text-right font-mono">{r.grossAmount}</td>
                    <td className="p-2">{workflowBadge(r.workflowStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="p-4 text-neutral-500">Brak dokumentów w tej zakładce — uruchom „Odśwież KSeF”.</p>
            ) : null}
          </div>

          <aside className="rounded border border-neutral-200 p-3 dark:border-neutral-700">
            {!selected ? (
              <p className="text-sm text-zinc-500">Wybierz dokument z listy.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-semibold">{selected.invoiceNumber || selected.ksefId}</p>
                  <p className="text-xs text-zinc-500">{selected.ksefId}</p>
                </div>
                <p>
                  <span className="text-zinc-500">Typ:</span> {directionLabel(selected.documentDirection)}
                </p>
                <p>
                  <span className="text-zinc-500">Sprzedawca:</span> {selected.sellerName}
                  {selected.sellerTaxId ? ` (NIP ${selected.sellerTaxId})` : ""}
                </p>
                <p>
                  <span className="text-zinc-500">Nabywca:</span> {selected.buyerName}
                </p>
                <p>
                  <span className="text-zinc-500">Kwoty:</span> {selected.netAmount} + {selected.vatAmount} ={" "}
                  <strong>{selected.grossAmount}</strong> {selected.currency}
                </p>
                <p>{workflowBadge(selected.workflowStatus)}</p>
                {selected.duplicateMatchSummary ? (
                  <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                    {selected.duplicateMatchSummary}
                  </div>
                ) : null}
                {selected.workflowStatus === "IMPORTED" && selected.importedAsCostInvoiceId ? (
                  <p>
                    <Link href="/cost-invoices" className="text-blue-600 underline dark:text-blue-400">
                      Faktura kosztowa utworzona (ID: {selected.importedAsCostInvoiceId.slice(0, 8)}…)
                    </Link>
                  </p>
                ) : null}
                {selected.duplicateOfCostInvoiceId ? (
                  <p>
                    <Link href="/cost-invoices" className="text-blue-600 underline dark:text-blue-400">
                      Podejrzany duplikat kosztu (ID: {selected.duplicateOfCostInvoiceId.slice(0, 8)}…)
                    </Link>
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  {canImportCost ? (
                    <Button
                      type="button"
                      disabled={actingId === selected.id}
                      onClick={() => void runAction(selected.id, "import-cost")}
                    >
                      Importuj jako koszt
                    </Button>
                  ) : null}

                  {importBlockedReason ? (
                    <p className="text-xs text-zinc-500">{importBlockedReason}</p>
                  ) : null}

                  {ws === "PROBABLE_DUPLICATE" && dir === "PURCHASE" ? (
                    <Button type="button" variant="secondary" disabled>
                      Duplikat — import zablokowany
                    </Button>
                  ) : null}

                  {ws !== "IMPORTED" && ws !== "REJECTED" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={actingId === selected.id}
                      onClick={() => void runAction(selected.id, "mark-duplicate")}
                    >
                      Oznacz jako duplikat
                    </Button>
                  ) : null}

                  {ws !== "IMPORTED" && ws !== "REJECTED" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={actingId === selected.id}
                      onClick={() => void runAction(selected.id, "reject")}
                    >
                      Odrzuć
                    </Button>
                  ) : null}

                  {ws === "REJECTED" || ws === "PROBABLE_DUPLICATE" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={actingId === selected.id}
                      onClick={() => void runAction(selected.id, "restore")}
                    >
                      Przywróć do nowych
                    </Button>
                  ) : null}

                  {dir === "SALE" ? (
                    <p className="text-xs text-zinc-500">Faktury sprzedażowe — tylko podgląd w MVP.</p>
                  ) : null}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
