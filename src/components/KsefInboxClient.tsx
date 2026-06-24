"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { AlertCircle, FileCheck, FileText, RefreshCw } from "lucide-react";
import { Alert, Badge, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { KsefDocumentDrawer } from "@/components/KsefDocumentDrawer";
import { KsefLinkedInvoiceModal } from "@/components/KsefLinkedInvoiceModal";
import { readApiResponse } from "@/lib/api-client";
import type { KsefInvoicePreview } from "@/lib/ksef/invoice-preview";
import type { KsefPaymentStatus } from "@/lib/ksef/payment-status";
import type { KsefImportCostBody, KsefImportRevenueBody } from "@/lib/validation/ksef-import-schemas";
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
  duplicateOfIncomeInvoiceId: string | null;
  duplicateMatchSummary: string | null;
  importedAsCostInvoiceId: string | null;
  importedAsRevenueInvoiceId: string | null;
  rejectedAt: string | null;
  importedAt: string | null;
  xmlFetchStatus: string | null;
  xmlFetchedAt: string | null;
  xmlFetchError: string | null;
  contractorName: string;
  linkedCostInvoiceId: string | null;
  linkedIncomeInvoiceId: string | null;
  paymentStatus: KsefPaymentStatus;
  paymentStatusLabel: string;
  invoiceGrossAmount: string;
  amountToPay: string;
  additionalChargesTotal: string | null;
  hasPaymentAmountSplit: boolean;
};

type DocDetail = {
  document: Row & {
    xmlFetchStatus: string | null;
    xmlFetchedAt: string | null;
    xmlFetchError: string | null;
  };
  preview: KsefInvoicePreview;
  rawPayload: unknown;
  xmlAvailable: boolean;
  xmlPayload: string | null;
  duplicateCost: {
    id: string;
    documentNumber: string;
    supplier: string;
    grossAmount: string;
  } | null;
  duplicateIncome: {
    id: string;
    invoiceNumber: string;
    contractor: string;
    grossAmount: string;
  } | null;
};

type DirectionTab = "PURCHASE" | "SALE" | "UNKNOWN";
type WorkflowFilter = "" | KsefWorkflowStatus;
type DocAction =
  | "import-cost"
  | "import-revenue"
  | "mark-duplicate"
  | "reject"
  | "restore"
  | "undo-import"
  | "fetch-xml";

const DIRECTION_TABS: { id: DirectionTab; label: string }[] = [
  { id: "PURCHASE", label: "Kosztowe" },
  { id: "SALE", label: "Przychodowe" },
  { id: "UNKNOWN", label: "Nieznane" },
];

function workflowBadge(status: KsefWorkflowStatus) {
  if (status === "NEW") return <Badge variant="default">Nowa</Badge>;
  if (status === "PROBABLE_DUPLICATE") return <Badge variant="warning">Już w systemie</Badge>;
  if (status === "IMPORTED") return <Badge variant="success">Zaimportowana</Badge>;
  return <Badge variant="muted">Odrzucona</Badge>;
}

function directionLabel(direction: KsefDocumentDirection) {
  if (direction === "PURCHASE") return "Zakup";
  if (direction === "SALE") return "Sprzedaż";
  return "Nieznany";
}

function paymentBadge(status: KsefPaymentStatus, label: string) {
  if (status === "PAID") return <Badge variant="success">{label}</Badge>;
  if (status === "PARTIAL") return <Badge variant="warning">{label}</Badge>;
  if (status === "OVERDUE") return <Badge variant="danger">{label}</Badge>;
  if (status === "NOT_APPLICABLE" || status === "NO_INVOICE") {
    return <Badge variant="muted">{label}</Badge>;
  }
  return <Badge variant="default">{label}</Badge>;
}

type DocActionOpts = {
  forceXml?: boolean;
  importBody?: KsefImportCostBody | KsefImportRevenueBody;
};

function QuickActionCell({
  row,
  acting,
  onOpenForImport,
  onOpenLinkedInvoice,
  onAction,
}: {
  row: Row;
  acting: boolean;
  onOpenForImport: (id: string) => void;
  onOpenLinkedInvoice: (kind: "cost" | "income", invoiceId: string) => void;
  onAction: (action: DocAction) => void;
}) {
  const stop = (e: MouseEvent) => e.stopPropagation();

  if (row.workflowStatus === "NEW" && row.documentDirection === "PURCHASE") {
    return (
      <Button
        type="button"
        variant="secondary"
        className="whitespace-nowrap px-2 py-1 text-xs"
        disabled={acting}
        onClick={(e) => {
          stop(e);
          onOpenForImport(row.id);
        }}
      >
        Obrób koszt
      </Button>
    );
  }
  if (row.workflowStatus === "NEW" && row.documentDirection === "SALE") {
    return (
      <Button
        type="button"
        variant="secondary"
        className="whitespace-nowrap px-2 py-1 text-xs"
        disabled={acting}
        onClick={(e) => {
          stop(e);
          onOpenForImport(row.id);
        }}
      >
        Obrób przychód
      </Button>
    );
  }
  if (row.workflowStatus === "IMPORTED") {
    const costId = row.importedAsCostInvoiceId;
    const incomeId = row.importedAsRevenueInvoiceId;
    if (!costId && !incomeId) return <span className="text-xs text-zinc-400">—</span>;
    return (
      <Button
        type="button"
        variant="secondary"
        className="whitespace-nowrap px-2 py-1 text-xs"
        onClick={(e) => {
          stop(e);
          if (costId) onOpenLinkedInvoice("cost", costId);
          else if (incomeId) onOpenLinkedInvoice("income", incomeId);
        }}
      >
        Otwórz fakturę
      </Button>
    );
  }
  if (row.workflowStatus === "PROBABLE_DUPLICATE") {
    const costId = row.linkedCostInvoiceId;
    const incomeId = row.linkedIncomeInvoiceId;
    if (costId || incomeId) {
      return (
        <Button
          type="button"
          variant="secondary"
          className="whitespace-nowrap px-2 py-1 text-xs"
          onClick={(e) => {
            stop(e);
            if (costId) onOpenLinkedInvoice("cost", costId);
            else if (incomeId) onOpenLinkedInvoice("income", incomeId);
          }}
        >
          Otwórz powiązaną
        </Button>
      );
    }
    return (
      <Button
        type="button"
        variant="secondary"
        className="whitespace-nowrap px-2 py-1 text-xs"
        disabled={acting}
        onClick={(e) => {
          stop(e);
          onAction("mark-duplicate");
        }}
      >
        Już w systemie
      </Button>
    );
  }
  return <span className="text-xs text-zinc-400">—</span>;
}

function XmlStatusIcon({
  row,
  loading,
}: {
  row: Row;
  loading?: boolean;
}) {
  if (row.source !== "KSEF") {
    return (
      <span className="inline-flex text-zinc-300" title="Tylko metadane (bez XML)">
        —
      </span>
    );
  }
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500" title="Pobieranie XML…">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
      </span>
    );
  }
  if (row.xmlFetchStatus === "OK") {
    return (
      <span title="XML pobrany" className="inline-flex">
        <FileCheck
          className="h-4 w-4 text-green-600 dark:text-green-500"
          aria-label="XML pobrany"
        />
      </span>
    );
  }
  if (row.xmlFetchStatus === "FAILED") {
    return (
      <span title={row.xmlFetchError ?? "Błąd pobrania XML"} className="inline-flex">
        <AlertCircle
          className="h-4 w-4 text-red-600 dark:text-red-400"
          aria-label="Błąd pobrania XML"
        />
      </span>
    );
  }
  return (
    <span title="XML niepobrany — pobierze się po otwarciu szczegółów" className="inline-flex">
      <FileText className="h-4 w-4 text-zinc-400" aria-label="XML niepobrany" />
    </span>
  );
}

async function fetchDocumentDetail(id: string): Promise<DocDetail | null> {
  const res = await fetch(`/api/ksef/documents/${id}`);
  const parsed = await readApiResponse(res);
  if (!parsed.ok || !parsed.data || typeof parsed.data !== "object") return null;
  return parsed.data as DocDetail;
}

type SyncResponse = {
  status?: string;
  upserted?: number;
  reclassified?: number;
  effectiveSource?: "MOCK" | "KSEF";
  syncRangeFrom?: string;
  syncRangeTo?: string;
};

function formatSyncResultMessage(j: SyncResponse, isStub: boolean): string {
  const from = j.syncRangeFrom?.slice(0, 10) ?? "?";
  const to = j.syncRangeTo?.slice(0, 10) ?? "?";
  const upserted = typeof j.upserted === "number" ? j.upserted : 0;
  const reclassified = typeof j.reclassified === "number" ? j.reclassified : 0;
  const source = j.effectiveSource ?? "?";
  let text = `Sync ${String(j.status)}: ${upserted} dokument(ów) dla zakresu ${from}…${to} (źródło: ${source}).`;
  if (reclassified > 0) {
    text += ` Przeklasyfikowano: ${reclassified}.`;
  }
  if (upserted === 0 && isStub) {
    text +=
      " 0 dokumentów dla tego zakresu. W trybie STUB dokumenty testowe są z lutego–kwietnia 2026 i mogą nie istnieć w tym zakresie.";
  }
  return text;
}

export function KsefInboxClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<KsefStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [xmlFetching, setXmlFetching] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [directionTab, setDirectionTab] = useState<DirectionTab>("PURCHASE");
  const [workflowFilter, setWorkflowFilter] = useState<WorkflowFilter>("");
  const [syncFrom, setSyncFrom] = useState("");
  const [manualRangeFrom, setManualRangeFrom] = useState("2026-01-01");
  const [manualRangeTo, setManualRangeTo] = useState("");
  const [focusImportSection, setFocusImportSection] = useState(false);
  const [linkedInvoiceEdit, setLinkedInvoiceEdit] = useState<{
    kind: "cost" | "income";
    id: string;
  } | null>(null);

  const needsInitialSyncFrom = status?.needsInitialSyncFrom ?? false;
  const isStubMode = status?.configuredDataSource === "STUB";

  const load = useCallback(async () => {
    const params = new URLSearchParams({ direction: directionTab });
    if (workflowFilter) params.set("workflow", workflowFilter);

    const [docRes, stRes] = await Promise.all([
      fetch(`/api/ksef/documents?${params}`),
      fetch("/api/ksef/status"),
    ]);
    const docParsed = await readApiResponse(docRes);
    const stParsed = await readApiResponse(stRes);
    if (stParsed.ok && stParsed.data && typeof stParsed.data === "object") {
      const stTyped = stParsed.data as KsefStatusResponse;
      setStatus(stTyped);
      setSyncFrom((prev) => prev || stTyped.initialSyncFrom || "");
    } else {
      setStatus(null);
    }
    if (!docParsed.ok) {
      setRows([]);
      setMsg({ type: "err", text: docParsed.errorText });
      return;
    }
    const list = Array.isArray(docParsed.data) ? (docParsed.data as Row[]) : [];
    setRows(list);
    setSelectedId((prev) => (prev && list.some((r) => r.id === prev) ? prev : null));
  }, [directionTab, workflowFilter]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setXmlFetching(false);
      return;
    }

    let cancelled = false;
    const documentId = selectedId;

    async function openDocumentDetail() {
      setDetailLoading(true);
      setXmlFetching(false);
      try {
        const initial = await fetchDocumentDetail(documentId);
        if (cancelled) return;
        if (!initial) {
          setDetail(null);
          return;
        }
        setDetail(initial);
        setDetailLoading(false);

        const shouldAutoFetchXml =
          initial.document.source === "KSEF" &&
          status?.willUseRealApiNextSync &&
          status?.ksefEnabled &&
          initial.document.xmlFetchStatus !== "OK";

        if (!shouldAutoFetchXml) return;

        setXmlFetching(true);
        const fetchRes = await fetch(`/api/ksef/documents/${documentId}/fetch-xml`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        await readApiResponse(fetchRes);
        if (cancelled) return;

        const refreshed = await fetchDocumentDetail(documentId);
        if (!cancelled && refreshed) setDetail(refreshed);
        if (!cancelled) await load();
      } catch {
        if (!cancelled) {
          const refreshed = await fetchDocumentDetail(documentId);
          if (refreshed) setDetail(refreshed);
          await load();
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
          setXmlFetching(false);
        }
      }
    }

    void openDocumentDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedId, status?.willUseRealApiNextSync, status?.ksefEnabled, load]);

  async function postSync(body: Record<string, unknown>) {
    setMsg(null);
    setSyncing(true);
    try {
      const res = await fetch("/api/ksef/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const parsed = await readApiResponse(res);
      const j = parsed.data as SyncResponse & { error?: string };
      if (!parsed.ok) {
        setMsg({ type: "err", text: parsed.errorText });
        return;
      }
      setMsg({
        type: "ok",
        text: formatSyncResultMessage(j, isStubMode),
      });
      await load();
    } catch {
      setMsg({ type: "err", text: "Błąd sieci przy synchronizacji." });
    } finally {
      setSyncing(false);
    }
  }

  async function sync() {
    if (needsInitialSyncFrom && !syncFrom.trim()) {
      setMsg({
        type: "err",
        text: "Ustaw datę „Pobieraj od” przed pierwszą synchronizacją.",
      });
      return;
    }
    const body = needsInitialSyncFrom ? { syncFrom: syncFrom.trim() } : {};
    await postSync(body);
  }

  async function syncManualRange() {
    if (!manualRangeFrom.trim()) {
      setMsg({ type: "err", text: "Ustaw datę „Od” w ręcznym zakresie." });
      return;
    }
    await postSync({
      syncFrom: manualRangeFrom.trim(),
      ...(manualRangeTo.trim() ? { syncTo: manualRangeTo.trim() } : {}),
      forceRange: true,
    });
  }

  async function runAction(id: string, action: DocAction, opts?: DocActionOpts) {
    setActingId(id);
    setMsg(null);
    try {
      const init: RequestInit = { method: "POST" };
      if (action === "fetch-xml") {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify({ force: opts?.forceXml === true });
      } else if (action === "import-cost" || action === "import-revenue") {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify(opts?.importBody ?? {});
      }
      const res = await fetch(`/api/ksef/documents/${id}/${action}`, init);
      const parsed = await readApiResponse(res);
      if (!parsed.ok) {
        setMsg({ type: "err", text: parsed.errorText });
        await load();
        if (selectedId === id) {
          const refreshed = await fetchDocumentDetail(id);
          if (refreshed) setDetail(refreshed);
        }
        return;
      }
      const okText =
        action === "fetch-xml"
          ? "Odświeżono XML faktury."
          : action === "import-cost"
            ? "Zapisano jako faktura kosztowa."
            : action === "import-revenue"
              ? "Zapisano jako faktura przychodowa."
              : action === "undo-import"
                ? "Import cofnięty."
                : action === "mark-duplicate"
                  ? "Oznaczono jako już w systemie."
                  : "Akcja wykonana.";
      if (action !== "fetch-xml" || opts?.forceXml) {
        setMsg({ type: "ok", text: okText });
      }
      await load();
      if (selectedId === id) {
        const refreshed = await fetchDocumentDetail(id);
        if (refreshed) setDetail(refreshed);
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : "";
      setMsg({
        type: "err",
        text: detail ? `Błąd akcji na dokumencie: ${detail}` : "Błąd akcji na dokumencie.",
      });
    } finally {
      setActingId(null);
    }
  }

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const selectedIndex = selectedId ? rows.findIndex((r) => r.id === selectedId) : -1;
  const ws = selected?.workflowStatus;
  const dir = selected?.documentDirection;
  const canImportCost = selected && dir === "PURCHASE" && ws === "NEW";
  const canImportRevenue = selected && dir === "SALE" && ws === "NEW";
  const canUndoImport =
    selected &&
    ws === "IMPORTED" &&
    (selected.importedAsCostInvoiceId || selected.importedAsRevenueInvoiceId);
  const importBlockedReason =
    selected && ws !== "IMPORTED" && ws !== "REJECTED" && dir === "UNKNOWN"
      ? "Import dostępny po poprawnej klasyfikacji (zakup lub sprzedaż). Ustaw KSEF_COMPANY_TAX_ID i zsynchronizuj ponownie."
      : null;
  const canRefreshXml = Boolean(
    selected?.source === "KSEF" &&
      status?.willUseRealApiNextSync &&
      status?.ksefEnabled &&
      detail?.document.xmlFetchStatus === "OK",
  );

  function openForImport(id: string) {
    setSelectedId(id);
    setFocusImportSection(true);
  }

  function openLinkedInvoice(kind: "cost" | "income", id: string) {
    setLinkedInvoiceEdit({ kind, id });
  }

  async function refreshAfterLinkedInvoiceSave() {
    await load();
    if (selectedId) {
      const refreshed = await fetchDocumentDetail(selectedId);
      if (refreshed) setDetail(refreshed);
    }
    setLinkedInvoiceEdit(null);
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">KSeF</h1>
          <p className="text-sm text-zinc-500">Skrzynka dokumentów KSeF — import kosztów i przychodów.</p>
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

      {isStubMode ? (
        <Alert variant="info">
          Tryb STUB — pobierane są tylko testowe dokumenty, nie realne faktury z KSeF. Dokumenty
          testowe są z lutego–kwietnia 2026. Dla danych testowych STUB użyj{" "}
          <span className="font-mono">KSEF_COMPANY_TAX_ID=9512120077</span>, żeby zobaczyć podział
          kosztowe/przychodowe.
        </Alert>
      ) : null}

      {!needsInitialSyncFrom ? (
        <div className="rounded border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/40">
          <p className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Ręczny zakres</p>
          <p className="mb-3 text-xs text-zinc-500">
            Pobierz dokumenty z wybranego okresu (np. testowe stuby z początku 2026). Standardowe
            „Odśwież KSeF” nadal używa ostatniego syncu − 3 dni.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Od">
              <Input
                type="date"
                value={manualRangeFrom}
                onChange={(e) => setManualRangeFrom(e.target.value)}
              />
            </Field>
            <Field label="Do (opcjonalnie)">
              <Input
                type="date"
                value={manualRangeTo}
                onChange={(e) => setManualRangeTo(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void syncManualRange()}
              disabled={syncing || loading || !manualRangeFrom.trim()}
            >
              Synchronizuj zakres
            </Button>
          </div>
        </div>
      ) : null}

      {status && !status.companyTaxIdConfigured ? (
        <Alert variant="info">
          Brak KSEF_COMPANY_TAX_ID — dokumenty mogą trafiać do zakładki „Nieznane”. Możesz je nadal
          przeglądać, odrzucać i oznaczać jako już w systemie.
        </Alert>
      ) : null}

      {status ? (
        <div
          className="rounded border border-neutral-200 bg-neutral-50/80 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900/50"
          aria-label="Status techniczny KSeF"
        >
          <p className="mb-2 font-medium text-neutral-700 dark:text-neutral-200">Diagnostyka</p>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Źródło</dt>
              <dd className="font-mono">{status.configuredDataSource}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">API base URL</dt>
              <dd className="font-mono text-xs">{status.apiBaseUrl}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Token KSeF (env)</dt>
              <dd className="font-mono">
                {status.ksefTokenConfigured
                  ? `tak (${status.ksefTokenLength ?? "?"} znaków)`
                  : "nie"}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-neutral-500">Sesja access JWT</dt>
              <dd className="font-mono">
                {status.accessSessionActive
                  ? `aktywna do ${status.accessExpiresAt?.slice(11, 19) ?? "?"}`
                  : "brak"}
              </dd>
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
          {status.deprecatedAccessTokenEnvSet ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
              Uwaga: KSEF_ACCESS_TOKEN jest przestarzały — użyj KSEF_KSEF_TOKEN (token z Aplikacji
              Podatnika). Wartość nie jest wysyłana jako Bearer.
            </p>
          ) : null}
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
            <option value="PROBABLE_DUPLICATE">Już w systemie</option>
            <option value="IMPORTED">Zaimportowane</option>
            <option value="REJECTED">Odrzucone</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-700">
          <table className="w-full min-w-[1100px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-left dark:border-neutral-700 dark:bg-neutral-900">
                <th className="p-2">Data</th>
                <th className="p-2">Numer</th>
                <th className="p-2">Kontrahent</th>
                <th className="p-2">Typ</th>
                <th className="p-2 text-right">Brutto</th>
                <th className="p-2">Workflow</th>
                <th className="p-2">Płatność</th>
                <th className="p-2 w-10 text-center" title="Status XML">
                  XML
                </th>
                <th className="p-2">Akcja</th>
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
                    onClick={() => {
                      setFocusImportSection(false);
                      setSelectedId(r.id);
                    }}
                >
                  <td className="p-2 whitespace-nowrap">{r.issueDate?.slice(0, 10) ?? "—"}</td>
                  <td className="p-2 font-mono text-xs">{r.invoiceNumber || "—"}</td>
                  <td className="max-w-[180px] truncate p-2" title={r.contractorName}>
                    {r.contractorName}
                  </td>
                  <td className="p-2 whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">
                    {directionLabel(r.documentDirection)}
                  </td>
                  <td className="p-2 text-right font-mono whitespace-nowrap">
                    <div>{r.amountToPay ?? r.grossAmount} {r.currency}</div>
                    {r.hasPaymentAmountSplit ? (
                      <div className="mt-0.5 text-[10px] font-sans text-zinc-500 dark:text-zinc-400">
                        faktura {r.invoiceGrossAmount} {r.currency}
                        {r.additionalChargesTotal
                          ? ` + obciążenia ${r.additionalChargesTotal}`
                          : ""}
                      </div>
                    ) : null}
                  </td>
                  <td className="p-2">{workflowBadge(r.workflowStatus)}</td>
                  <td className="p-2">{paymentBadge(r.paymentStatus, r.paymentStatusLabel)}</td>
                  <td className="p-2 text-center">
                    <XmlStatusIcon row={r} loading={selectedId === r.id && xmlFetching} />
                  </td>
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <QuickActionCell
                      row={r}
                      acting={actingId === r.id}
                      onOpenForImport={openForImport}
                      onOpenLinkedInvoice={openLinkedInvoice}
                      onAction={(action) => void runAction(r.id, action)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? (
            <p className="p-4 text-neutral-500">Brak dokumentów w tej zakładce — uruchom „Odśwież KSeF”.</p>
          ) : null}
        </div>
      )}

      <KsefDocumentDrawer
        open={Boolean(selectedId && selected)}
        document={
          selected
            ? {
                id: selected.id,
                invoiceNumber: selected.invoiceNumber,
                workflowStatus: selected.workflowStatus,
                documentDirection: selected.documentDirection,
                paymentStatus: selected.paymentStatus,
                paymentStatusLabel: selected.paymentStatusLabel,
              }
            : null
        }
        index={selectedIndex}
        total={rows.length}
        detailLoading={detailLoading}
        detailProps={
          selected && detail?.preview
            ? {
                source: selected.source,
                workflowStatus: selected.workflowStatus,
                importedAsCostInvoiceId: selected.importedAsCostInvoiceId,
                importedAsRevenueInvoiceId: selected.importedAsRevenueInvoiceId,
                duplicateMatchSummary: selected.duplicateMatchSummary,
                preview: detail.preview,
                rawPayload: detail.rawPayload,
                xmlPayload: detail.xmlPayload,
                xmlFetchStatus: detail.document.xmlFetchStatus,
                xmlFetchedAt: detail.document.xmlFetchedAt,
                xmlFetchError: detail.document.xmlFetchError,
                xmlFetching,
                canRefreshXml,
                duplicateCost: detail.duplicateCost,
                duplicateIncome: detail.duplicateIncome,
                acting: actingId === selected.id,
                canImportCost: Boolean(canImportCost),
                canImportRevenue: Boolean(canImportRevenue),
                canUndoImport: Boolean(canUndoImport),
                importBlockedReason,
                onAction: (action, opts) => void runAction(selected.id, action, opts),
                focusImportSection,
                onImportFocusHandled: () => setFocusImportSection(false),
                onImportCostSubmit: (body) => void runAction(selected.id, "import-cost", { importBody: body }),
                onImportRevenueSubmit: (body) =>
                  void runAction(selected.id, "import-revenue", { importBody: body }),
                onOpenLinkedInvoice: openLinkedInvoice,
              }
            : null
        }
        onClose={() => {
          setSelectedId(null);
          setFocusImportSection(false);
        }}
        onPrevious={() => {
          if (selectedIndex > 0) {
            setFocusImportSection(false);
            setSelectedId(rows[selectedIndex - 1]!.id);
          }
        }}
        onNext={() => {
          if (selectedIndex >= 0 && selectedIndex < rows.length - 1) {
            setFocusImportSection(false);
            setSelectedId(rows[selectedIndex + 1]!.id);
          }
        }}
        canPrevious={selectedIndex > 0}
        canNext={selectedIndex >= 0 && selectedIndex < rows.length - 1}
      />

      <KsefLinkedInvoiceModal
        kind={linkedInvoiceEdit?.kind ?? null}
        invoiceId={linkedInvoiceEdit?.id ?? null}
        open={Boolean(linkedInvoiceEdit)}
        onClose={() => setLinkedInvoiceEdit(null)}
        onSaved={() => void refreshAfterLinkedInvoiceSave()}
      />
    </div>
  );
}
