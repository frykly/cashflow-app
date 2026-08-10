"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatVehicleLabel } from "@/lib/accounting/vehicle-label";
import { ContractorNameLink } from "@/components/ContractorNameLink";
import { Alert, Badge, Button, Spinner } from "@/components/ui";
import { CostInvoicesListToolbar } from "@/components/CostInvoicesListToolbar";
import { CostListAccount5Cell } from "@/components/Account5CopyActions";
import {
  datesForCostDatePreset,
  inferCostDatePreset,
  normalizeCostDateField,
  COST_DEFAULT_DATE_FIELD,
  type CostDateField,
  type CostDatePreset,
} from "@/lib/cost-list-date-filter";
import { formatDate, formatMoney } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { readApiErrorBody, readApiResponse } from "@/lib/api-client";
import { usePersistentListState } from "@/hooks/usePersistentListState";
import { isCalendarOverdue } from "@/lib/cashflow/overdue";
import type { CostInvoice, CostInvoicePayment } from "@prisma/client";
import { costRemainingGross, isCostFullyPaid, sumCostPaymentsGross } from "@/lib/cashflow/settlement";
import {
  costEffectivePaymentGross,
  costHasPaymentAmountSplit,
} from "@/lib/cashflow/cost-payment-amount";
import {
  addSavedCostListView,
  COST_LIST_PERSISTENCE_CONFIG,
  loadSavedCostListViews,
  removeSavedCostListView,
  type SavedCostListView,
} from "@/lib/cost-invoices-list-storage";
import { postCreateReturnFromSearchParams, type PostCreateReturnCapture } from "@/lib/safe-internal-return-path";
import {
  NewCostInvoiceFormModal,
  emptyDraft,
  costInvoicePrefillFromPlannedEvent,
  type CostInvoiceRow,
  type Draft,
} from "@/components/CostInvoiceFormModal";

export type { CostInvoiceRow };

type PayPick = Pick<CostInvoicePayment, "amountGross">;
type Row = CostInvoiceRow;

type ProjectOption = { id: string; name: string; isActive: boolean; code?: string | null };
type VehicleOption = {
  id: string;
  registrationNumber: string;
  make?: string | null;
  model?: string | null;
  name?: string | null;
  isActive?: boolean;
};
type Cat = {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
  accountingCode?: string | null;
  accountingName?: string | null;
};

type CostFormModalState = {
  mode: "create" | "edit";
  invoiceId?: string | null;
  initialDraft?: Partial<Draft>;
  sourcePlannedEventId?: string | null;
  postCreateReturn?: PostCreateReturnCapture;
  preferMultiProjectAllocation?: boolean;
} | null;

function paymentSourceLabel(src: string) {
  if (src === "VAT_THEN_MAIN") return "VAT → MAIN";
  return src === "MAIN" ? "MAIN" : "VAT";
}

function statusBadge(s: string) {
  if (s === "ZAPLACONA") return <Badge variant="success">Zapłacona</Badge>;
  if (s === "PARTIALLY_PAID") return <Badge variant="warning">Częściowo</Badge>;
  if (s === "DO_ZAPLATY") return <Badge variant="warning">Do zapłaty</Badge>;
  return <Badge variant="muted">Planowana</Badge>;
}

function recurringSourceBadge(r: Row) {
  if (!r.isGeneratedFromRecurring) return <Badge variant="muted">Ręczne</Badge>;
  if (r.isRecurringDetached) return <Badge variant="warning">Cykliczne · odłączone</Badge>;
  return <Badge variant="default">Cykliczne</Badge>;
}

function costEntrySourceBadge(r: Row) {
  const bankLinked = r.payments?.some((p) => p.bankTransactionId);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {bankLinked ? (
        <span title="Powiązanie z płatnością z importu bankowego">
          <Badge variant="default">Bank</Badge>
        </span>
      ) : null}
      {recurringSourceBadge(r)}
    </span>
  );
}

function costRowOverdue(r: Row): boolean {
  const inv = r as unknown as CostInvoice;
  const pays = (r.payments ?? []) as unknown as PayPick[];
  if (isCostFullyPaid(inv, pays)) return false;
  const now = new Date();
  if (!r.plannedPaymentDate || !r.paymentDueDate) return false;
  return (
    isCalendarOverdue(new Date(r.plannedPaymentDate), now) ||
    isCalendarOverdue(new Date(r.paymentDueDate), now)
  );
}

function CostListSubline({
  r,
  settled,
  remaining,
}: {
  r: Row;
  settled: number;
  remaining: number;
}) {
  const src = paymentSourceLabel(r.paymentSource);
  const srcLong =
    r.paymentSource === "VAT_THEN_MAIN"
      ? "Najpierw konto VAT, potem MAIN (wg ustawień dokumentu)"
      : r.paymentSource === "MAIN"
        ? "Płatność z konta MAIN"
        : "Płatność z konta VAT";
  const cat = r.expenseCategory?.name ?? "—";
  const note = [r.description?.trim(), r.notes?.trim()].filter(Boolean).join(" — ");
  return (
    <div className="mt-1.5 space-y-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="shrink-0 text-zinc-400">Źródło</span>
        <span className="min-w-0">{costEntrySourceBadge(r)}</span>
        <span className="text-zinc-400">·</span>
        <span className="line-clamp-1 min-w-0" title={`Kategoria: ${cat}`}>
          Kat.: {cat}
        </span>
      </p>
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span title={srcLong}>VAT / płatność: {src}</span>
        <span className="text-zinc-400">·</span>
        <span title="Suma zarejestrowanych zapłat brutto" className="tabular-nums text-zinc-600 dark:text-zinc-300">
          Zapłac.: {formatMoney(settled)}
        </span>
        <span className="text-zinc-400">·</span>
        <span title="Pozostało do rozliczenia brutto" className="tabular-nums text-zinc-600 dark:text-zinc-300">
          Zostało: {formatMoney(remaining)}
        </span>
        {note ? (
          <>
            <span className="text-zinc-400">·</span>
            <span className="line-clamp-2 min-w-0 max-w-full break-words text-zinc-500" title={note}>
              {note}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "plannedPaymentDate", label: "Plan. zapłata" },
  { value: "paymentDueDate", label: "Termin płatności" },
  { value: "documentDate", label: "Data dokumentu" },
  { value: "documentNumber", label: "Numer dokumentu" },
  { value: "supplier", label: "Dostawca" },
  { value: "netAmount", label: "Netto" },
  { value: "grossAmount", label: "Brutto" },
  { value: "status", label: "Status" },
  { value: "createdAt", label: "Data utworzenia" },
];

function costListClassificationCell(r: Row) {
  const account5 = r.account5Code?.trim() || null;
  const account4 = r.expenseCategory?.accountingCode?.trim() || null;
  const note = r.accountingNote?.trim() || "";
  const vehicleReg = r.vehicle ? formatVehicleLabel(r.vehicle) : null;
  if (!account5 && !account4 && !note && !vehicleReg) {
    return <span className="text-zinc-500 dark:text-zinc-400">—</span>;
  }
  return (
    <div className="space-y-0.5 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
      {account5 ? (
        <p className="font-mono font-medium text-zinc-900 dark:text-zinc-100" title="Konto 5">
          5: {account5}
        </p>
      ) : null}
      {account4 ? (
        <p className="font-mono text-zinc-600 dark:text-zinc-400" title="Konto 4">
          4: {account4}
        </p>
      ) : null}
      {note ? (
        <p className="line-clamp-2 break-words text-zinc-500 dark:text-zinc-400" title={note}>
          {note}
        </p>
      ) : null}
      {vehicleReg ? (
        <p className="truncate text-emerald-800 dark:text-emerald-300" title={`Pojazd: ${vehicleReg}`}>
          {vehicleReg}
        </p>
      ) : null}
    </div>
  );
}

export function CostInvoicesClient({ initialQueryString = "" }: { initialQueryString?: string }) {
  const { queryString, setParam, setParams, merged, clearPersisted, replaceQuery } = usePersistentListState(
    initialQueryString,
    COST_LIST_PERSISTENCE_CONFIG,
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [formModal, setFormModal] = useState<CostFormModalState>(null);

  const [filterDraft, setFilterDraft] = useState({
    q: "",
    status: "",
    datePreset: "all" as CostDatePreset,
    categoryIds: [] as string[],
    uncategorizedOnly: false,
    recurringSource: "",
    projectId: "",
    vehicleId: "",
    costPlaceKind: "",
    paymentSource: "",
    account4: "",
    dateFrom: "",
    dateTo: "",
    dateField: COST_DEFAULT_DATE_FIELD as CostDateField,
    overdueOnly: false,
  });

  const [savedViews, setSavedViews] = useState<SavedCostListView[]>([]);

  useEffect(() => {
    setSavedViews(loadSavedCostListViews());
  }, []);

  useEffect(() => {
    const m = new URLSearchParams(queryString);
    const catsRaw = m.get("categories")?.trim();
    const legacy = m.get("categoryId")?.trim();
    const categoryIds = catsRaw
      ? catsRaw.split(",").map((x) => x.trim()).filter(Boolean)
      : legacy ? [legacy] : [];
    setFilterDraft({
      q: m.get("q") ?? "",
      status: m.get("status") ?? "",
      datePreset: inferCostDatePreset(m.get("dateFrom") ?? "", m.get("dateTo") ?? ""),
      categoryIds,
      uncategorizedOnly: m.get("uncategorized") === "1",
      recurringSource: m.get("recurringSource") ?? "",
      projectId: m.get("projectId") ?? "",
      vehicleId: m.get("vehicleId") ?? "",
      costPlaceKind: m.get("costPlaceKind") ?? "",
      paymentSource: m.get("paymentSource") ?? "",
      account4: m.get("account4") ?? "",
      dateFrom: m.get("dateFrom") ?? "",
      dateTo: m.get("dateTo") ?? "",
      dateField: normalizeCostDateField(m.get("dateField")),
      overdueOnly: m.get("overdue") === "1",
    });
  }, [queryString]);

  useEffect(() => {
    fetch("/api/expense-categories").then((r) => r.json()).then((j: Cat[]) => setCategories(Array.isArray(j) ? j : [])).catch(() => setCategories([]));
    fetch("/api/projects").then((r) => r.json()).then((j: ProjectOption[]) => setProjects(Array.isArray(j) ? j : [])).catch(() => setProjects([]));
    fetch("/api/vehicles?activeOnly=1").then((r) => r.json()).then((j: VehicleOption[]) => setVehicles(Array.isArray(j) ? j : [])).catch(() => setVehicles([]));
  }, []);

  const load = useCallback(async () => {
    setListLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/cost-invoices?${queryString}`);
      const parsed = await readApiResponse(r);
      if (!parsed.ok) throw new Error(parsed.errorText);
      setRows(Array.isArray(parsed.data) ? (parsed.data as Row[]) : []);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : "Nie udało się wczytać listy");
    } finally {
      setListLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  function mainDateParams(d = filterDraft) {
    const dates = datesForCostDatePreset(d.datePreset, { from: d.dateFrom, to: d.dateTo });
    const hasDates = Boolean(dates.dateFrom || dates.dateTo);
    const dateField = normalizeCostDateField(d.dateField);
    return { dateFrom: dates.dateFrom, dateTo: dates.dateTo, dateField: hasDates ? dateField : null };
  }

  function applyMainFilters() {
    setParams({ q: filterDraft.q.trim() || null, status: filterDraft.status || null, ...mainDateParams() });
  }

  function handleStatusChange(status: string) {
    setFilterDraft((d) => ({ ...d, status }));
    setParam("status", status || null);
  }

  function handleDatePresetChange(preset: CostDatePreset) {
    const dates = datesForCostDatePreset(preset, { from: filterDraft.dateFrom, to: filterDraft.dateTo });
    const nextDraft = { ...filterDraft, datePreset: preset, dateFrom: dates.dateFrom ?? "", dateTo: dates.dateTo ?? "" };
    setFilterDraft(nextDraft);
    setParams(mainDateParams(nextDraft));
  }

  function handleDateFieldChange(dateField: CostDateField) {
    setFilterDraft((d) => ({ ...d, dateField }));
    const hasDates = filterDraft.datePreset !== "all" || Boolean(filterDraft.dateFrom.trim() || filterDraft.dateTo.trim());
    if (hasDates) setParams(mainDateParams({ ...filterDraft, dateField }));
  }

  function applyAdvancedFilters() {
    setParams({
      categories: filterDraft.uncategorizedOnly ? null : filterDraft.categoryIds.length > 0 ? filterDraft.categoryIds.join(",") : null,
      categoryId: null,
      uncategorized: filterDraft.uncategorizedOnly ? "1" : null,
      recurringSource: filterDraft.recurringSource || null,
      projectId: filterDraft.projectId || null,
      vehicleId: filterDraft.vehicleId || null,
      costPlaceKind: filterDraft.costPlaceKind || null,
      paymentSource: filterDraft.paymentSource || null,
      account4: filterDraft.account4.trim() || null,
      overdue: filterDraft.overdueOnly ? "1" : null,
    });
  }

  function clearFilters() {
    clearPersisted();
    setParams({
      q: null, status: null, categories: null, categoryId: null, uncategorized: null, recurringSource: null,
      projectId: null, vehicleId: null, costPlaceKind: null, paymentSource: null, account4: null,
      dateFrom: null, dateTo: null, dateField: null, overdue: null, sort: null, order: null,
    });
  }

  function saveCurrentView() {
    const name = window.prompt("Nazwa widoku (np. miesiąc + kategorie):");
    if (name == null || !name.trim()) return;
    addSavedCostListView(name.trim(), queryString);
    setSavedViews(loadSavedCostListViews());
  }

  function loadSavedView(v: SavedCostListView) { replaceQuery(v.query); }
  function deleteSavedView(id: string) {
    if (!confirm("Usunąć zapisany widok z tej przeglądarki?")) return;
    removeSavedCostListView(id);
    setSavedViews(loadSavedCostListViews());
  }

  const sort = merged.get("sort") ?? "plannedPaymentDate";
  const order = (merged.get("order") === "desc" ? "desc" : "asc") as "asc" | "desc";

  function clickHeaderSort(key: string) {
    if (!SORT_OPTIONS.some((o) => o.value === key)) return;
    if (sort === key) setParam("order", order === "asc" ? "desc" : "asc");
    else setParams({ sort: key, order: "asc" });
  }

  function costSortTh(label: string, sortKey: string, align: "left" | "right" = "left") {
    const active = sort === sortKey;
    const ac = align === "right" ? "justify-end text-right" : "justify-start text-left";
    return (
      <button type="button" className={`${ac} inline-flex w-full min-w-0 items-center gap-0.5 rounded-md py-0.5 text-xs font-semibold uppercase tracking-wide hover:bg-zinc-200/80 hover:text-zinc-950 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-50 ${active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"}`} onClick={() => clickHeaderSort(sortKey)}>
        <span className="min-w-0">{label}</span>
        {active ? (order === "asc" ? " ↑" : " ↓") : null}
      </button>
    );
  }

  function openNew() {
    setFormModal({ mode: "create" });
  }

  function openEdit(r: Row, opts?: { preferMultiProjectAllocation?: boolean }) {
    setFormModal({ mode: "edit", invoiceId: r.id, preferMultiProjectAllocation: opts?.preferMultiProjectAllocation });
  }

  function handleRowClickOpenEdit(r: Row) {
    return (e: React.MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("button, a, input, textarea, select, label")) return;
      openEdit(r);
    };
  }

  const stripCostDeepLinkParams = {
    editCost: null as string | null,
    new: null as string | null,
    projectId: null as string | null,
    clientName: null as string | null,
    projectName: null as string | null,
    projectCode: null as string | null,
    convertPlannedEventId: null as string | null,
    multiProject: null as string | null,
    returnTo: null as string | null,
  };

  const listQs = merged.toString();
  useEffect(() => {
    const m = new URLSearchParams(listQs);
    const editCost = m.get("editCost");
    const openMultiAlloc = m.get("multiProject") === "1";
    const wantNew = m.get("new") === "1";
    const convertPlanned = m.get("convertPlannedEventId")?.trim() || null;
    const prefillPid = m.get("projectId")?.trim() || null;
    const prefillClient = m.get("clientName")?.trim() || "";
    const prefillProjectName = m.get("projectName")?.trim() || "";
    const prefillProjectCode = m.get("projectCode")?.trim() || "";
    if (!editCost && !wantNew && !convertPlanned) return;
    let cancelled = false;
    void (async () => {
      if (editCost) {
        queueMicrotask(() => setParams(stripCostDeepLinkParams));
        if (!cancelled) setFormModal({ mode: "edit", invoiceId: editCost, preferMultiProjectAllocation: openMultiAlloc });
        return;
      }
      if (convertPlanned) {
        const r = await fetch(`/api/planned-events/${convertPlanned}`);
        const ev = await r.json();
        if (cancelled) return;
        if (!r.ok || ev.status !== "PLANNED" || ev.type !== "EXPENSE") {
          alert("Nie można utworzyć faktury z tego zdarzenia (wymagane: status „Zaplanowane”, typ wydatek).");
          queueMicrotask(() => setParams(stripCostDeepLinkParams));
          return;
        }
        let supplier = prefillClient;
        if (!supplier && ev.projectId) {
          const pr = await fetch(`/api/projects/${ev.projectId}`);
          const pj = await pr.json();
          if (pr.ok && pj?.clientName) supplier = String(pj.clientName).trim();
        }
        const pd = isoToDateInputValue(ev.plannedDate);
        const plannedAmounts = costInvoicePrefillFromPlannedEvent(ev);
        const d: Draft = {
          ...emptyDraft(),
          documentNumber: `ZPL-${ev.id.slice(0, 10)}`,
          supplier,
          description: ev.title ? `Z planu: ${ev.title}` : "",
          netAmount: plannedAmounts.netAmount,
          vatAmount: plannedAmounts.vatAmount,
          grossAmount: plannedAmounts.grossAmount,
          vatRate: plannedAmounts.vatRate,
          documentDate: pd,
          paymentDueDate: pd,
          plannedPaymentDate: pd,
          projectId: ev.projectId || prefillPid || null,
          expenseCategoryId: ev.expenseCategoryId || null,
        };
        if (prefillProjectName || prefillProjectCode) {
          const extra = [prefillProjectName && `Projekt: ${prefillProjectName}`, prefillProjectCode && `Numer zlecenia: ${prefillProjectCode}`].filter(Boolean).join(" · ");
          if (extra) d.description = d.description ? `${d.description} · ${extra}` : extra;
        }
        queueMicrotask(() => setParams(stripCostDeepLinkParams));
        if (!cancelled) setFormModal({ mode: "create", initialDraft: d, sourcePlannedEventId: ev.id, postCreateReturn: postCreateReturnFromSearchParams(m) });
        return;
      }
      if (wantNew) {
        if (cancelled) return;
        const d = emptyDraft();
        if (prefillPid) d.projectId = prefillPid;
        if (prefillClient) d.supplier = prefillClient;
        if (prefillProjectName || prefillProjectCode) {
          const parts = [prefillProjectName && `Projekt: ${prefillProjectName}`, prefillProjectCode && `Numer zlecenia: ${prefillProjectCode}`].filter(Boolean) as string[];
          if (parts.length) d.description = parts.join(" · ");
        }
        queueMicrotask(() => setParams(stripCostDeepLinkParams));
        setFormModal({ mode: "create", initialDraft: d, postCreateReturn: postCreateReturnFromSearchParams(m) });
      }
    })();
    return () => { cancelled = true; };
  }, [listQs, setParams]);

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportMsg(null);
    const fd = new FormData();
    fd.set("file", f);
    try {
      const res = await fetch("/api/cost-invoices/import", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) { setImportMsg(readApiErrorBody(j)); return; }
      setImportMsg(`Import: OK ${j.ok}, błędnych wierszy: ${j.errors?.length ?? 0}`);
      load();
    } catch { setImportMsg("Błąd sieci przy imporcie"); }
    e.target.value = "";
  }

  async function deleteCostInvoiceById(id: string): Promise<boolean> {
    const res = await fetch(`/api/cost-invoices/${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); alert(readApiErrorBody(j)); return false; }
    return true;
  }

  async function remove(id: string) {
    if (!confirm("Usunąć ten dokument kosztowy?")) return;
    if (await deleteCostInvoiceById(id)) load();
  }

  const overdueFilterActive = merged.get("overdue") === "1";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Faktury kosztowe</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Źródło płatności określa, które konto jest obciążane brutto.
            {overdueFilterActive ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <Badge variant="warning">Po terminie</Badge>
                <Link href="/cost-invoices" className="text-zinc-600 underline dark:text-zinc-400">
                  Wyczyść filtr
                </Link>
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={load} disabled={listLoading}>
            Odśwież
          </Button>
          <Button type="button" onClick={openNew} disabled={listLoading}>
            Dodaj
          </Button>
        </div>
      </div>

      <CostInvoicesListToolbar
        filterDraft={filterDraft}
        setFilterDraft={setFilterDraft}
        merged={merged}
        queryString={queryString}
        listLoading={listLoading}
        projects={projects}
        categories={categories}
        vehicles={vehicles}
        sort={sort}
        order={order}
        onSortChange={(v) => setParam("sort", v)}
        onOrderChange={(v) => setParam("order", v)}
        onApplyMain={applyMainFilters}
        onApplyAdvanced={applyAdvancedFilters}
        onClear={clearFilters}
        onClearChip={(updates) => setParams(updates)}
        onDatePresetChange={handleDatePresetChange}
        onDateFieldChange={handleDateFieldChange}
        onStatusChange={handleStatusChange}
        savedViews={savedViews}
        onLoadView={loadSavedView}
        onSaveView={saveCurrentView}
        onDeleteView={deleteSavedView}
        onImportFile={onImportFile}
        importMsg={importMsg}
      />

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <div className="max-h-[min(70vh,56rem)] overflow-y-auto">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="sticky top-0 z-20 w-[14%] border-b border-zinc-200 bg-zinc-50 px-2 py-2 pl-3 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Numer", "documentNumber")}
                </th>
                <th className="sticky top-0 z-20 w-[19%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Dostawca", "supplier")}
                </th>
                <th className="sticky top-0 z-20 w-[12%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Miejsce (konto 5)
                </th>
                <th className="sticky top-0 z-20 w-[14%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Klasyfikacja
                </th>
                <th className="sticky top-0 z-20 w-[10%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Do zapłaty", "grossAmount", "right")}
                </th>
                <th className="sticky top-0 z-20 w-[11%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Plan", "plannedPaymentDate")}
                </th>
                <th className="sticky top-0 z-20 w-[12%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Status", "status")}
                </th>
                <th className="sticky top-0 z-20 w-[12%] border-b border-zinc-200 bg-zinc-50 px-2 py-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Akcje
                </th>
              </tr>
            </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {listLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                  <Spinner className="mr-2 inline !size-5" />
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                  Brak dokumentów kosztowych. Użyj <strong>Dodaj</strong>.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const overdue = costRowOverdue(r);
                const inv = r as unknown as CostInvoice;
                const pays = (r.payments ?? []) as unknown as PayPick[];
                const settled = sumCostPaymentsGross(pays);
                const remaining = costRemainingGross(inv, pays);
                return (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={handleRowClickOpenEdit(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEdit(r);
                      }
                    }}
                    className={`group cursor-pointer bg-white align-top transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/80 ${
                      overdue ? "border-l-4 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20" : ""
                    }`}
                  >
                    <td className="min-w-0 px-2 py-2.5 pl-3">
                      <span className="inline-flex flex-wrap items-center gap-1 font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        <span className="break-all">{r.documentNumber}</span>
                        {overdue ? <Badge variant="warning">Po terminie</Badge> : null}
                      </span>
                      <CostListSubline r={r} settled={settled} remaining={remaining} />
                    </td>
                    <td className="min-w-0 px-1 py-2.5 text-sm text-zinc-800 dark:text-zinc-200" title={r.supplier}>
                      <span className="line-clamp-2 break-words">
                        <ContractorNameLink name={r.supplier} />
                      </span>
                    </td>
                    <td className="min-w-0 px-1 py-2.5 text-xs align-top">
                      <CostListAccount5Cell row={r} />
                    </td>
                    <td className="min-w-0 px-1 py-2.5 align-top">{costListClassificationCell(r)}</td>
                    <td className="px-1 py-2.5 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
                      {(() => {
                        const invPick = {
                          grossAmount: String(r.grossAmount),
                          amountToPayGross: r.amountToPayGross ?? null,
                        };
                        const paymentGross = costEffectivePaymentGross(invPick);
                        const split = costHasPaymentAmountSplit(invPick);
                        return (
                          <div>
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {formatMoney(paymentGross)}
                            </div>
                            {split ? (
                              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                faktura {formatMoney(r.grossAmount)}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="min-w-0 px-1 py-2.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {r.plannedPaymentDate ? formatDate(r.plannedPaymentDate) : "—"}
                    </td>
                    <td className="min-w-0 px-1 py-2.5">{statusBadge(r.status)}</td>
                    <td className="px-2 py-2.5 pr-3 text-right align-top">
                      <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="!h-auto !py-0.5 !px-1.5 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(r);
                          }}
                        >
                          Edytuj
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="!h-auto !py-0.5 !px-1.5 text-xs text-red-600 dark:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(r.id);
                          }}
                        >
                          Usuń
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      <NewCostInvoiceFormModal
        open={formModal !== null}
        mode={formModal?.mode ?? "create"}
        invoiceId={formModal?.invoiceId}
        initialDraft={formModal?.initialDraft}
        sourcePlannedEventId={formModal?.sourcePlannedEventId}
        postCreateReturn={formModal?.postCreateReturn}
        preferMultiProjectAllocation={formModal?.preferMultiProjectAllocation}
        onClose={() => setFormModal(null)}
        onSaved={() => {
          setFormModal(null);
          load();
        }}
      />
    </div>
  );
}
