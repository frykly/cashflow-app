"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectSearchPicker } from "@/components/ProjectSearchPicker";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { CrudToolbar } from "@/components/CrudToolbar";
import { formatDate, formatMoney, toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { amountsFromGrossRate, amountsFromNetRate, inferVatRateFromAmounts, type VatRatePct } from "@/lib/vat-rate";
import { InvoiceAmountFields, type AmountEntryMode } from "@/components/InvoiceAmountFields";
import { NameAutocomplete } from "@/components/NameAutocomplete";
import { readApiErrorBody } from "@/lib/api-client";
import { useListQuery } from "@/hooks/useListQuery";
import { isCalendarOverdue } from "@/lib/cashflow/overdue";
import type { CostInvoice, CostInvoicePayment } from "@prisma/client";
import { costRemainingGross, isCostFullyPaid, sumCostPaymentsGross } from "@/lib/cashflow/settlement";
import { DueDateOffsetControls } from "@/components/DueDateOffsetControls";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { isStoredVatOnlyCost } from "@/lib/validation/is-vat-only-cost";
import { projectAllocationListLinks } from "@/lib/project-display";
import { documentGrossSlicesFromInvoice } from "@/lib/payment-project-allocation/distribute-read";
import { defaultProportionalPaymentAllocationRows } from "@/lib/payment-project-allocation/default-rows";
import {
  addSavedCostListView,
  loadLastCostListQuery,
  loadSavedCostListViews,
  removeSavedCostListView,
  saveLastCostListQuery,
  type SavedCostListView,
} from "@/lib/cost-invoices-list-storage";

type PayPick = Pick<CostInvoicePayment, "amountGross">;

type ProjectOption = { id: string; name: string; isActive: boolean; code?: string | null };

type Row = {
  id: string;
  documentNumber: string;
  supplier: string;
  description: string;
  vatRate: number;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  documentDate?: string | null;
  paymentDueDate?: string | null;
  plannedPaymentDate?: string | null;
  status: string;
  paid: boolean;
  actualPaymentDate: string | null;
  paymentSource: string;
  notes: string;
  expenseCategoryId?: string | null;
  expenseCategory?: { id: string; name: string; slug: string } | null;
  payments?: {
    id: string;
    amountGross: string;
    paymentDate: string;
    notes: string;
    bankTransactionId?: string | null;
    projectAllocations?: { projectId: string; grossAmount: unknown; project?: { id: string; name: string } | null }[];
  }[];
  isGeneratedFromRecurring?: boolean;
  isRecurringDetached?: boolean;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  projectName?: string | null;
  projectAllocations?: {
    id: string;
    projectId: string;
    netAmount: unknown;
    grossAmount: unknown;
    description: string;
    project?: { id: string; name: string } | null;
  }[];
};

type Draft = Omit<Row, "id"> & { id?: string };

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  const { vatAmount, grossAmount } = amountsFromNetRate("0", 23);
  return {
    documentNumber: "",
    supplier: "",
    description: "",
    vatRate: 23,
    netAmount: "0",
    vatAmount,
    grossAmount,
    documentDate: todayYmd(),
    paymentDueDate: todayYmd(),
    plannedPaymentDate: todayYmd(),
    status: "PLANOWANA",
    paid: false,
    actualPaymentDate: null,
    paymentSource: "MAIN",
    notes: "",
    expenseCategoryId: null,
    projectId: null,
  };
}

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

const DATE_FIELD_OPTIONS = [
  { value: "plannedPaymentDate", label: "Plan. zapłata" },
  { value: "paymentDueDate", label: "Termin płatności" },
  { value: "documentDate", label: "Data dokumentu" },
];

/** Tylko obiektywne presety (bez heurystyk kategorii). */
const COST_QUICK_PRESETS = [
  { id: "all" as const, label: "Wszystkie" },
  { id: "uncategorized" as const, label: "Bez kategorii" },
  { id: "overdue" as const, label: "Po terminie" },
];

function costListFiltersEmptyForQuickAll(m: URLSearchParams): boolean {
  return (
    !m.get("q")?.trim() &&
    !m.get("status")?.trim() &&
    !m.get("categories")?.trim() &&
    !m.get("categoryId")?.trim() &&
    m.get("uncategorized") !== "1" &&
    m.get("overdue") !== "1" &&
    !m.get("recurringSource")?.trim() &&
    !m.get("projectId")?.trim() &&
    !m.get("dateFrom")?.trim() &&
    !m.get("dateTo")?.trim()
  );
}

type Cat = { id: string; name: string; slug: string; isActive?: boolean };

function costInvoiceMultiProject(editing: Pick<Draft, "projectAllocations" | "projectId">): boolean {
  return (editing.projectAllocations?.length ?? 0) > 1;
}

function prefillPaymentProjectRows(editing: Draft, amountGrossStr: string) {
  const inv = {
    projectAllocations: (editing.projectAllocations ?? []).map((a) => ({
      projectId: a.projectId,
      grossAmount: a.grossAmount,
    })),
    grossAmount: editing.grossAmount,
    projectId: editing.projectId ?? null,
  };
  const slices = documentGrossSlicesFromInvoice(inv);
  return defaultProportionalPaymentAllocationRows(slices, amountGrossStr);
}

export function CostInvoicesClient({ initialQueryString = "" }: { initialQueryString?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { queryString, setParam, setParams, merged } = useListQuery("cost", initialQueryString);
  const [rows, setRows] = useState<Row[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payDraft, setPayDraft] = useState({ amountGross: "", paymentDate: "", notes: "" });
  const [payProjectRows, setPayProjectRows] = useState<{ projectId: string; grossAmount: string }[]>([]);
  const [payProjectManual, setPayProjectManual] = useState(false);
  const [paySaving, setPaySaving] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [supplierSuggestions, setSupplierSuggestions] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const plannedPaymentManualRef = useRef(false);
  const sourcePlannedEventIdRef = useRef<string | null>(null);
  const [amountEntryMode, setAmountEntryMode] = useState<AmountEntryMode>("net");
  /** Netto 0, brutto = VAT — np. płatność samego VAT z konta VAT. */
  const [vatOnlyPayment, setVatOnlyPayment] = useState(false);
  const [projectAllocMode, setProjectAllocMode] = useState<"simple" | "multi">("simple");
  const [projectAllocRows, setProjectAllocRows] = useState<
    { projectId: string; netAmount: string; grossAmount: string; description: string }[]
  >([]);

  const [filterDraft, setFilterDraft] = useState({
    q: "",
    status: "",
    categoryIds: [] as string[],
    uncategorizedOnly: false,
    recurringSource: "",
    projectId: "",
    dateFrom: "",
    dateTo: "",
    dateField: "plannedPaymentDate",
    overdueOnly: false,
  });

  const [savedViews, setSavedViews] = useState<SavedCostListView[]>([]);
  const persistReadyRef = useRef(false);
  const restoredRef = useRef(false);

  useEffect(() => {
    setSavedViews(loadSavedCostListViews());
  }, []);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    if (initialQueryString.trim().length > 0) return;
    const last = loadLastCostListQuery();
    if (!last?.trim()) return;
    router.replace(`${pathname}?${last}`);
  }, [initialQueryString, pathname, router]);

  useEffect(() => {
    const m = new URLSearchParams(queryString);
    const catsRaw = m.get("categories")?.trim();
    const legacy = m.get("categoryId")?.trim();
    const categoryIds = catsRaw
      ? catsRaw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : legacy
        ? [legacy]
        : [];
    setFilterDraft({
      q: m.get("q") ?? "",
      status: m.get("status") ?? "",
      categoryIds,
      uncategorizedOnly: m.get("uncategorized") === "1",
      recurringSource: m.get("recurringSource") ?? "",
      projectId: m.get("projectId") ?? "",
      dateFrom: m.get("dateFrom") ?? "",
      dateTo: m.get("dateTo") ?? "",
      dateField: m.get("dateField") || "plannedPaymentDate",
      overdueOnly: m.get("overdue") === "1",
    });
  }, [queryString]);

  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true;
      return;
    }
    saveLastCostListQuery(queryString);
  }, [queryString]);

  useEffect(() => {
    fetch("/api/expense-categories")
      .then((r) => r.json())
      .then((j: Cat[]) => setCategories(Array.isArray(j) ? j : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j: ProjectOption[]) => setProjects(Array.isArray(j) ? j : []))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/cost-invoices/suggestions")
      .then((r) => r.json())
      .then((j: { names?: string[] }) => setSupplierSuggestions(Array.isArray(j?.names) ? j.names : []))
      .catch(() => setSupplierSuggestions([]));
  }, [open]);

  const load = useCallback(async () => {
    setListLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/cost-invoices?${queryString}`);
      const j = await r.json();
      if (!r.ok) throw new Error(readApiErrorBody(j));
      setRows(j);
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

  function applyFilters() {
    setParams({
      q: filterDraft.q.trim() || null,
      status: filterDraft.status || null,
      categories:
        filterDraft.uncategorizedOnly ? null
        : filterDraft.categoryIds.length > 0 ?
          filterDraft.categoryIds.join(",")
        : null,
      categoryId: null,
      uncategorized: filterDraft.uncategorizedOnly ? "1" : null,
      recurringSource: filterDraft.recurringSource || null,
      projectId: filterDraft.projectId || null,
      dateFrom: filterDraft.dateFrom || null,
      dateTo: filterDraft.dateTo || null,
      dateField: filterDraft.dateField,
      overdue: filterDraft.overdueOnly ? "1" : null,
    });
  }

  function clearFilters() {
    setParams({
      q: null,
      status: null,
      categories: null,
      categoryId: null,
      uncategorized: null,
      recurringSource: null,
      projectId: null,
      dateFrom: null,
      dateTo: null,
      dateField: null,
      overdue: null,
    });
  }

  function applyQuickPreset(id: "all" | "uncategorized" | "overdue") {
    if (id === "all") {
      clearFilters();
      return;
    }
    if (id === "uncategorized") {
      setParams({
        uncategorized: "1",
        categories: null,
        categoryId: null,
      });
      return;
    }
    setParams({ overdue: "1" });
  }

  function saveCurrentView() {
    const name = window.prompt("Nazwa widoku (np. miesiąc + kategorie):");
    if (name == null || !name.trim()) return;
    addSavedCostListView(name.trim(), queryString);
    setSavedViews(loadSavedCostListViews());
  }

  function loadSavedView(v: SavedCostListView) {
    router.replace(`${pathname}?${v.query}`);
  }

  function deleteSavedView(id: string) {
    if (!confirm("Usunąć zapisany widok z tej przeglądarki?")) return;
    removeSavedCostListView(id);
    setSavedViews(loadSavedCostListViews());
  }

  const categoriesForForm = useMemo(() => {
    const sel = editing.expenseCategoryId;
    return categories.filter((c) => c.isActive !== false || c.id === sel);
  }, [categories, editing.expenseCategoryId]);

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
      <button
        type="button"
        className={`${ac} inline-flex w-full min-w-0 items-center gap-0.5 rounded-md py-0.5 text-xs font-semibold uppercase tracking-wide hover:bg-zinc-200/80 hover:text-zinc-950 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-50 ${active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"}`}
        onClick={() => clickHeaderSort(sortKey)}
      >
        <span className="min-w-0">{label}</span>
        {active ? (order === "asc" ? " ↑" : " ↓") : null}
      </button>
    );
  }

  function closeModal() {
    setOpen(false);
    setFormError(null);
    setPayOpen(false);
    sourcePlannedEventIdRef.current = null;
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
  }

  function openNew() {
    plannedPaymentManualRef.current = false;
    sourcePlannedEventIdRef.current = null;
    setAmountEntryMode("net");
    setVatOnlyPayment(false);
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
    setEditing(emptyDraft());
    setFormError(null);
    setOpen(true);
  }

  function handleRowClickOpenEdit(r: Row) {
    return (e: React.MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("button, a, input, textarea, select, label")) return;
      openEdit(r);
    };
  }

  function applyPaymentDue(dueYmd: string) {
    setEditing((prev) => {
      const next = { ...prev, paymentDueDate: dueYmd };
      if (!plannedPaymentManualRef.current) {
        next.plannedPaymentDate = dueYmd;
      }
      return next;
    });
  }

  function openEdit(r: Row, opts?: { preferMultiProjectAllocation?: boolean }) {
    const vatOnlyRec = isStoredVatOnlyCost(r.netAmount, r.vatAmount);
    setVatOnlyPayment(vatOnlyRec);
    const rate = (
      vatOnlyRec
        ? (r.vatRate as VatRatePct)
        : (r.vatRate ?? inferVatRateFromAmounts(Number(r.netAmount), Number(r.vatAmount)))
    ) as VatRatePct;
    const pp = isoToDateInputValue(r.plannedPaymentDate);
    const pd = isoToDateInputValue(r.paymentDueDate);
    plannedPaymentManualRef.current = pp !== pd;
    setAmountEntryMode("net");
    setEditing({
      ...r,
      isGeneratedFromRecurring: !!r.isGeneratedFromRecurring,
      isRecurringDetached: !!r.isRecurringDetached,
      vatRate: rate,
      expenseCategoryId: r.expenseCategoryId ?? null,
      documentDate: isoToDateInputValue(r.documentDate),
      paymentDueDate: isoToDateInputValue(r.paymentDueDate),
      plannedPaymentDate: isoToDateInputValue(r.plannedPaymentDate),
      actualPaymentDate: r.actualPaymentDate ? isoToDateInputValue(r.actualPaymentDate) : null,
      netAmount: String(r.netAmount),
      vatAmount: String(r.vatAmount),
      grossAmount: String(r.grossAmount),
    });
    const pa = r.projectAllocations;
    if (pa && pa.length > 0) {
      setProjectAllocMode("multi");
      setProjectAllocRows(
        pa.map((a) => ({
          projectId: a.projectId,
          netAmount: String(a.netAmount),
          grossAmount: String(a.grossAmount),
          description: a.description ?? "",
        })),
      );
    } else if (opts?.preferMultiProjectAllocation) {
      setProjectAllocMode("multi");
      const pid = r.projectId?.trim();
      setProjectAllocRows(
        pid
          ? [
              {
                projectId: pid,
                netAmount: String(r.netAmount),
                grossAmount: String(r.grossAmount),
                description: "",
              },
            ]
          : [
              {
                projectId: "",
                netAmount: String(r.netAmount),
                grossAmount: String(r.grossAmount),
                description: "",
              },
            ],
      );
    } else {
      setProjectAllocMode("simple");
      setProjectAllocRows([]);
    }
    setFormError(null);
    setOpen(true);
  }

  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  const stripCostDeepLinkParams = {
    editCost: null as string | null,
    new: null as string | null,
    projectId: null as string | null,
    clientName: null as string | null,
    projectName: null as string | null,
    projectCode: null as string | null,
    convertPlannedEventId: null as string | null,
    multiProject: null as string | null,
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
        const r = await fetch(`/api/cost-invoices/${editCost}`);
        const j = await r.json();
        if (cancelled) return;
        if (r.ok) {
          openEditRef.current(
            j as Row,
            openMultiAlloc ? { preferMultiProjectAllocation: true } : undefined,
          );
        }
        queueMicrotask(() => setParams(stripCostDeepLinkParams));
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
        plannedPaymentManualRef.current = false;
        setAmountEntryMode("net");
        setVatOnlyPayment(false);
        const pd = isoToDateInputValue(ev.plannedDate);
        const net = String(ev.amount ?? "0");
        const rate = 23 as VatRatePct;
        const a = amountsFromNetRate(net, rate);
        const d: Draft = {
          ...emptyDraft(),
          documentNumber: `ZPL-${ev.id.slice(0, 10)}`,
          supplier,
          description: ev.title ? `Z planu: ${ev.title}` : "",
          netAmount: net,
          vatAmount: a.vatAmount,
          grossAmount: a.grossAmount,
          vatRate: rate,
          documentDate: pd,
          paymentDueDate: pd,
          plannedPaymentDate: pd,
          projectId: ev.projectId || prefillPid || null,
          expenseCategoryId: ev.expenseCategoryId || null,
        };
        {
          let desc = ev.title ? `Z planu: ${ev.title}` : "";
          if (prefillProjectName || prefillProjectCode) {
            const extra = [prefillProjectName && `Projekt: ${prefillProjectName}`, prefillProjectCode && `Numer zlecenia: ${prefillProjectCode}`]
              .filter(Boolean)
              .join(" · ");
            if (extra) desc = desc ? `${desc} · ${extra}` : extra;
          }
          d.description = desc;
        }
        sourcePlannedEventIdRef.current = ev.id;
        setEditing(d);
        setFormError(null);
        setOpen(true);
        queueMicrotask(() => setParams(stripCostDeepLinkParams));
        return;
      }
      if (wantNew) {
        if (cancelled) return;
        plannedPaymentManualRef.current = false;
        setAmountEntryMode("net");
        setVatOnlyPayment(false);
        const d = emptyDraft();
        if (prefillPid) d.projectId = prefillPid;
        if (prefillClient) d.supplier = prefillClient;
        if (prefillProjectName || prefillProjectCode) {
          const parts = [prefillProjectName && `Projekt: ${prefillProjectName}`, prefillProjectCode && `Numer zlecenia: ${prefillProjectCode}`].filter(
            Boolean,
          ) as string[];
          if (parts.length) d.description = parts.join(" · ");
        }
        setEditing(d);
        setFormError(null);
        setOpen(true);
        queueMicrotask(() => setParams(stripCostDeepLinkParams));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listQs, setParams]);

  async function refreshPaymentsForInvoice(id: string) {
    const r = await fetch(`/api/cost-invoices/${id}`);
    const j = await r.json();
    if (!r.ok) return;
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...j } : row)));
    setEditing((prev) => {
      if (prev.id !== id) return prev;
      setVatOnlyPayment(isStoredVatOnlyCost(j.netAmount, j.vatAmount));
      plannedPaymentManualRef.current =
        isoToDateInputValue(j.plannedPaymentDate) !== isoToDateInputValue(j.paymentDueDate);
      return {
        ...prev,
        ...j,
        isGeneratedFromRecurring: !!j.isGeneratedFromRecurring,
        isRecurringDetached: !!j.isRecurringDetached,
        expenseCategoryId: j.expenseCategoryId ?? null,
        vatRate: j.vatRate ?? prev.vatRate,
        documentDate: isoToDateInputValue(j.documentDate),
        paymentDueDate: isoToDateInputValue(j.paymentDueDate),
        plannedPaymentDate: isoToDateInputValue(j.plannedPaymentDate),
        actualPaymentDate: j.actualPaymentDate ? isoToDateInputValue(j.actualPaymentDate) : null,
        netAmount: String(j.netAmount),
        vatAmount: String(j.vatAmount),
        grossAmount: String(j.grossAmount),
      };
    });
  }

  function handleAmountModeChange(m: AmountEntryMode) {
    if (vatOnlyPayment) return;
    setAmountEntryMode(m);
    setEditing((prev) => {
      if (m === "gross") {
        const a = amountsFromGrossRate(prev.grossAmount, prev.vatRate as VatRatePct);
        return { ...prev, netAmount: a.netAmount, vatAmount: a.vatAmount };
      }
      const a = amountsFromNetRate(prev.netAmount, prev.vatRate as VatRatePct);
      return { ...prev, vatAmount: a.vatAmount, grossAmount: a.grossAmount };
    });
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!editing.id) return;
    const pd = toIsoOrNull(payDraft.paymentDate);
    if (!pd) {
      setFormError("Ustaw datę płatności.");
      return;
    }
    const gNorm = normalizeDecimalInput(payDraft.amountGross);
    if (costInvoiceMultiProject(editing)) {
      if (payProjectRows.length === 0) {
        setFormError("Ustaw podział brutto na projekty (dokument ma wiele alokacji).");
        return;
      }
      const sum = payProjectRows.reduce((a, r) => a + (Number(normalizeDecimalInput(r.grossAmount)) || 0), 0);
      const target = Number(gNorm);
      if (!Number.isFinite(sum) || !Number.isFinite(target) || Math.abs(sum - target) > 0.02) {
        setFormError("Suma brutto po projektach musi równać się kwocie płatności.");
        return;
      }
    }
    setPaySaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        amountGross: gNorm,
        paymentDate: pd,
        notes: payDraft.notes,
      };
      if (costInvoiceMultiProject(editing) && payProjectRows.length > 0) {
        body.projectAllocations = payProjectRows.map((r) => ({
          projectId: r.projectId,
          grossAmount: normalizeDecimalInput(r.grossAmount),
          description: "",
        }));
      }
      const res = await fetch(`/api/cost-invoices/${editing.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      setPayOpen(false);
      setPayDraft({ amountGross: "", paymentDate: "", notes: "" });
      setPayProjectRows([]);
      setPayProjectManual(false);
      await refreshPaymentsForInvoice(editing.id);
      load();
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setPaySaving(false);
    }
  }

  async function deletePayment(pid: string) {
    if (!editing.id) return;
    if (!confirm("Usunąć tę płatność?")) return;
    const res = await fetch(`/api/cost-invoices/${editing.id}/payments/${pid}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    await refreshPaymentsForInvoice(editing.id);
    load();
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportMsg(null);
    const fd = new FormData();
    fd.set("file", f);
    try {
      const res = await fetch("/api/cost-invoices/import", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) {
        setImportMsg(readApiErrorBody(j));
        return;
      }
      setImportMsg(`Import: OK ${j.ok}, błędnych wierszy: ${j.errors?.length ?? 0}`);
      load();
    } catch {
      setImportMsg("Błąd sieci przy imporcie");
    }
    e.target.value = "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const documentDate = toIsoOrNull(String(editing.documentDate ?? ""));
    const paymentDueDate = toIsoOrNull(String(editing.paymentDueDate ?? ""));
    const plannedPaymentDate = toIsoOrNull(String(editing.plannedPaymentDate ?? ""));
    if (!documentDate || !paymentDueDate || !plannedPaymentDate) {
      setFormError("Uzupełnij poprawnie datę dokumentu, termin i planowaną datę zapłaty.");
      setSaving(false);
      return;
    }
    const recurringPatch =
      editing.id && editing.isGeneratedFromRecurring
        ? { isRecurringDetached: !!editing.isRecurringDetached }
        : {};
    const projectIdPayload = editing.projectId?.trim() || null;

    if (projectAllocMode === "multi") {
      const ok = projectAllocRows.filter((row) => row.projectId.trim());
      if (ok.length === 0) {
        setFormError("Tryb kilku projektów: dodaj co najmniej jeden wiersz z wybranym projektem.");
        setSaving(false);
        return;
      }
    }

    const allocPart: Record<string, unknown> = (() => {
      if (projectAllocMode === "multi") {
        const ok = projectAllocRows.filter((row) => row.projectId.trim());
        return {
          projectAllocations: ok.map((row) => ({
            projectId: row.projectId,
            netAmount: normalizeDecimalInput(row.netAmount),
            grossAmount: normalizeDecimalInput(row.grossAmount),
            description: row.description.trim(),
          })),
        };
      }
      if (editing.id) return { projectAllocations: [] as never[] };
      return {};
    })();

    const projectField =
      projectAllocMode === "multi" ? { projectId: null } : { projectId: projectIdPayload };

    const url = editing.id ? `/api/cost-invoices/${editing.id}` : "/api/cost-invoices";
    const method = editing.id ? "PATCH" : "POST";
    const postExtra =
      method === "POST" && sourcePlannedEventIdRef.current
        ? { sourcePlannedEventId: sourcePlannedEventIdRef.current }
        : {};

    const body = vatOnlyPayment
      ? {
          documentNumber: editing.documentNumber,
          supplier: editing.supplier,
          description: editing.description,
          vatOnly: true,
          vatRate: 0,
          netAmount: normalizeDecimalInput("0"),
          vatAmount: normalizeDecimalInput(editing.vatAmount),
          grossAmount: normalizeDecimalInput(editing.grossAmount),
          documentDate,
          paymentDueDate,
          plannedPaymentDate,
          status: editing.status,
          paid: editing.status === "ZAPLACONA",
          actualPaymentDate: toIsoOrNull(editing.actualPaymentDate ?? undefined),
          paymentSource: editing.paymentSource,
          notes: editing.notes,
          ...projectField,
          expenseCategoryId: editing.expenseCategoryId || null,
          ...recurringPatch,
          ...postExtra,
          ...allocPart,
        }
      : {
          documentNumber: editing.documentNumber,
          supplier: editing.supplier,
          description: editing.description,
          vatOnly: false,
          vatRate: editing.vatRate,
          netAmount: normalizeDecimalInput(editing.netAmount),
          documentDate,
          paymentDueDate,
          plannedPaymentDate,
          status: editing.status,
          paid: editing.status === "ZAPLACONA",
          actualPaymentDate: toIsoOrNull(editing.actualPaymentDate ?? undefined),
          paymentSource: editing.paymentSource,
          notes: editing.notes,
          ...projectField,
          expenseCategoryId: editing.expenseCategoryId || null,
          ...recurringPatch,
          ...postExtra,
          ...allocPart,
        };
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      closeModal();
      if (method === "POST") {
        const redirectPid =
          projectAllocMode === "multi"
            ? projectAllocRows.find((x) => x.projectId.trim())?.projectId
            : projectIdPayload;
        if (redirectPid) {
          router.push(`/projects/${redirectPid}`);
          return;
        }
      }
      load();
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCostInvoiceById(id: string): Promise<boolean> {
    const res = await fetch(`/api/cost-invoices/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return false;
    }
    return true;
  }

  async function remove(id: string) {
    if (!confirm("Usunąć ten dokument kosztowy?")) return;
    if (await deleteCostInvoiceById(id)) load();
  }

  async function removeFromEdit() {
    if (!editing.id) return;
    if (!confirm("Usunąć ten dokument kosztowy? Operacja jest nieodwracalna.")) return;
    if (await deleteCostInvoiceById(editing.id)) {
      closeModal();
      load();
    }
  }

  const overdueFilterActive = merged.get("overdue") === "1";
  const quickAllActive = costListFiltersEmptyForQuickAll(merged);

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
        <CrudToolbar
          sortOptions={SORT_OPTIONS}
          sort={sort}
          order={order}
          onSortChange={(v) => setParam("sort", v)}
          onOrderChange={(v) => setParam("order", v)}
          onRefresh={load}
          onAdd={openNew}
          loading={listLoading}
        />
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="mb-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Szybki widok</p>
          <div className="flex flex-wrap gap-2">
            {COST_QUICK_PRESETS.map((p) => {
              const active =
                p.id === "all" ? quickAllActive
                : p.id === "uncategorized" ? merged.get("uncategorized") === "1"
                : merged.get("overdue") === "1";
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyQuickPreset(p.id)}
                  disabled={listLoading}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-zinc-300 bg-white/60 px-3 py-2 dark:border-zinc-600 dark:bg-zinc-950/40">
          <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Moje widoki (ta przeglądarka)</label>
            <div className="flex flex-wrap gap-2">
              <Select
                className="w-full min-w-0 sm:min-w-[12rem]"
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  const v = savedViews.find((x) => x.id === id);
                  if (v) loadSavedView(v);
                  e.target.value = "";
                }}
                disabled={listLoading || savedViews.length === 0}
              >
                <option value="">{savedViews.length ? "Wczytaj widok…" : "Brak zapisanych widoków"}</option>
                {savedViews.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="secondary" className="!py-1.5 !text-xs" onClick={saveCurrentView} disabled={listLoading}>
                Zapisz bieżący widok
              </Button>
            </div>
            {savedViews.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500">
                {savedViews.map((v) => (
                  <li key={v.id} className="inline-flex items-center gap-1">
                    <button type="button" className="text-blue-600 underline dark:text-blue-400" onClick={() => loadSavedView(v)}>
                      {v.name}
                    </button>
                    <button
                      type="button"
                      className="text-red-600 dark:text-red-400"
                      title="Usuń widok"
                      onClick={() => deleteSavedView(v.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Filtry i wyszukiwanie</span>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="!py-1.5 !text-xs" onClick={clearFilters} disabled={listLoading}>
              Wyczyść filtry
            </Button>
            <Button type="button" className="!py-1.5 !text-xs" onClick={applyFilters} disabled={listLoading}>
              Zastosuj
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <Field label="Szukaj (nr, dostawca, opis, projekt)">
            <Input
              className="w-full min-w-0"
              value={filterDraft.q}
              onChange={(e) => setFilterDraft((d) => ({ ...d, q: e.target.value }))}
              placeholder="np. FV/1, dostawca lub projekt"
              disabled={listLoading}
            />
          </Field>
          <Field label="Projekt">
            <Select
              value={filterDraft.projectId}
              onChange={(e) => setFilterDraft((d) => ({ ...d, projectId: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">(wszystkie)</option>
              {projects
                .slice()
                .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "pl"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.isActive ? " (nieaktywny)" : ""}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              value={filterDraft.status}
              onChange={(e) => setFilterDraft((d) => ({ ...d, status: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">(wszystkie)</option>
              <option value="PLANOWANA">Planowana</option>
              <option value="DO_ZAPLATY">Do zapłaty</option>
              <option value="PARTIALLY_PAID">Częściowo zapłacona</option>
              <option value="ZAPLACONA">Zapłacona</option>
            </Select>
          </Field>
          <div className="sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Kategorie</span>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300"
                checked={filterDraft.uncategorizedOnly}
                onChange={(e) =>
                  setFilterDraft((d) => ({
                    ...d,
                    uncategorizedOnly: e.target.checked,
                    categoryIds: e.target.checked ? [] : d.categoryIds,
                  }))
                }
                disabled={listLoading}
              />
              Tylko bez kategorii
            </label>
            <div className="max-h-36 overflow-y-auto rounded border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-950">
              {categories.length === 0 ? (
                <p className="text-xs text-zinc-500">Brak kategorii — dodaj w Ustawieniach.</p>
              ) : (
                <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                  {categories.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs">
                      <input
                        type="checkbox"
                        className="size-3.5 rounded border-zinc-300"
                        checked={filterDraft.categoryIds.includes(c.id)}
                        disabled={listLoading || filterDraft.uncategorizedOnly}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFilterDraft((d) => {
                            const next = new Set(d.categoryIds);
                            if (checked) next.add(c.id);
                            else next.delete(c.id);
                            return { ...d, categoryIds: [...next], uncategorizedOnly: false };
                          });
                        }}
                      />
                      <span className={c.isActive === false ? "text-zinc-500" : ""}>{c.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">Zaznacz wiele kategorii i kliknij „Zastosuj”.</p>
          </div>
          <Field label="Źródło wpisu">
            <Select
              value={filterDraft.recurringSource}
              onChange={(e) => setFilterDraft((d) => ({ ...d, recurringSource: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">Wszystkie</option>
              <option value="manual">Ręczne</option>
              <option value="generated">Z cyklicznych</option>
            </Select>
          </Field>
          <Field label="Pole daty (zakres)">
            <Select
              value={filterDraft.dateField}
              onChange={(e) => setFilterDraft((d) => ({ ...d, dateField: e.target.value }))}
              disabled={listLoading}
            >
              {DATE_FIELD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data od">
            <Input
              type="date"
              value={filterDraft.dateFrom}
              onChange={(e) => setFilterDraft((d) => ({ ...d, dateFrom: e.target.value }))}
              disabled={listLoading}
            />
          </Field>
          <Field label="Data do">
            <Input
              type="date"
              value={filterDraft.dateTo}
              onChange={(e) => setFilterDraft((d) => ({ ...d, dateTo: e.target.value }))}
              disabled={listLoading}
            />
          </Field>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            className="size-4 rounded border-zinc-300"
            checked={filterDraft.overdueOnly}
            onChange={(e) => setFilterDraft((d) => ({ ...d, overdueOnly: e.target.checked }))}
            disabled={listLoading}
          />
          Tylko po terminie (niezapłacone, data &lt; dziś)
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          <Link href="/cost-invoices?overdue=1" className="font-medium text-zinc-700 underline dark:text-zinc-300">
            Szybki link: tylko przeterminowane
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-700">
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Eksport (z filtrami):</span>
          <a className="text-zinc-800 underline dark:text-zinc-200" href={`/api/cost-invoices/export?format=csv&${queryString}`}>
            CSV
          </a>
          <a className="text-zinc-800 underline dark:text-zinc-200" href={`/api/cost-invoices/export?format=xlsx&${queryString}`}>
            Excel
          </a>
          <label className="cursor-pointer text-zinc-800 underline dark:text-zinc-200">
            Import CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onImportFile} />
          </label>
        </div>
        {importMsg ? <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{importMsg}</p> : null}
      </div>

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
                <th className="sticky top-0 z-20 w-[14%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Projekt
                </th>
                <th className="sticky top-0 z-20 w-[9%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Netto", "netAmount", "right")}
                </th>
                <th className="sticky top-0 z-20 w-[9%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Brutto", "grossAmount", "right")}
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
                      <span className="line-clamp-2 break-words">{r.supplier}</span>
                    </td>
                    <td className="min-w-0 max-w-[220px] px-1 py-2.5 text-xs align-top">
                      {(() => {
                        const items = projectAllocationListLinks(r);
                        if (items.length === 0) {
                          return <span className="text-zinc-500 dark:text-zinc-400">—</span>;
                        }
                        const multi = items.length > 1;
                        return (
                          <div
                            className={
                              multi
                                ? "rounded-md border border-emerald-200/90 bg-emerald-50/60 px-1.5 py-1 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                                : ""
                            }
                          >
                            {multi ? (
                              <p className="mb-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-emerald-900 dark:text-emerald-300">
                                Wiele projektów
                              </p>
                            ) : null}
                            <ul className="list-none space-y-1">
                              {items.map((it, idx) => (
                                <li key={`${it.projectId || "x"}-${idx}`}>
                                  {it.projectId ? (
                                    <Link
                                      href={`/projects/${it.projectId}`}
                                      className="break-words font-medium text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:decoration-emerald-600 dark:text-emerald-300 dark:decoration-emerald-700 dark:hover:decoration-emerald-400"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {it.label}
                                    </Link>
                                  ) : (
                                    <span
                                      className="break-words text-amber-800 dark:text-amber-300"
                                      title="Wybierz projekt z listy przy edycji, aby dodać link"
                                    >
                                      {it.label}
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-1 py-2.5 text-right text-sm tabular-nums font-medium text-zinc-900 dark:text-zinc-100">
                      {formatMoney(Number(r.netAmount))}
                    </td>
                    <td className="px-1 py-2.5 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
                      {formatMoney(Number(r.grossAmount))}
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

      <Modal
        open={open}
        title={editing.id ? "Edycja faktury kosztowej" : "Nowa faktura kosztowa"}
        onClose={closeModal}
        size="lg"
      >
        <form onSubmit={save} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          {formError && <Alert variant="error">{formError}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Numer dokumentu">
              <Input
                value={editing.documentNumber}
                onChange={(e) => setEditing({ ...editing, documentNumber: e.target.value })}
                required
                disabled={saving}
              />
            </Field>
            <Field label="Dostawca">
              <NameAutocomplete
                listId="cost-supplier-suggestions"
                suggestions={supplierSuggestions}
                value={editing.supplier}
                onChange={(e) => setEditing({ ...editing, supplier: e.target.value })}
                required
                disabled={saving}
              />
            </Field>
          </div>
          <Field label="Kategoria kosztu">
            <Select
              value={editing.expenseCategoryId ?? ""}
              onChange={(e) => setEditing({ ...editing, expenseCategoryId: e.target.value || null })}
              disabled={saving}
            >
              <option value="">(brak)</option>
              {categoriesForForm.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isActive === false ? " (zarchiwizowana)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Opis">
            <Textarea
              rows={2}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              disabled={saving}
            />
          </Field>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300"
                checked={projectAllocMode === "multi"}
                disabled={saving}
                onChange={(e) => {
                  const on = e.target.checked;
                  setProjectAllocMode(on ? "multi" : "simple");
                  if (on) {
                    setProjectAllocRows((prev) => {
                      if (prev.length > 0) return prev;
                      const pid = editing.projectId?.trim();
                      if (pid) {
                        return [
                          {
                            projectId: pid,
                            netAmount: editing.netAmount,
                            grossAmount: editing.grossAmount,
                            description: "",
                          },
                        ];
                      }
                      return [{ projectId: "", netAmount: editing.netAmount, grossAmount: editing.grossAmount, description: "" }];
                    });
                  } else {
                    setProjectAllocRows([]);
                  }
                }}
              />
              Alokacja na kilka projektów (suma netto i brutto = dokument)
            </label>
            {projectAllocMode === "multi" ? (
              <div className="mt-3 space-y-2">
                {projectAllocRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <Field label="Projekt">
                      <Select
                        value={row.projectId}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, projectId: v } : x)));
                        }}
                        disabled={saving}
                      >
                        <option value="">—</option>
                        {projects
                          .slice()
                          .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "pl"))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <Field label="Netto (alokacja)">
                      <Input
                        value={row.netAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, netAmount: v } : x)));
                        }}
                        disabled={saving}
                      />
                    </Field>
                    <Field label="Brutto (alokacja)">
                      <Input
                        value={row.grossAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, grossAmount: v } : x)));
                        }}
                        disabled={saving}
                      />
                    </Field>
                    <Field label="Notatka (opcjonalnie)">
                      <Input
                        value={row.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, description: v } : x)));
                        }}
                        disabled={saving}
                      />
                    </Field>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-xs"
                    disabled={saving}
                    onClick={() =>
                      setProjectAllocRows((rows) => [
                        ...rows,
                        { projectId: "", netAmount: editing.netAmount, grossAmount: editing.grossAmount, description: "" },
                      ])
                    }
                  >
                    + Wiersz
                  </Button>
                  {projectAllocRows.length > 1 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!text-xs"
                      disabled={saving}
                      onClick={() => setProjectAllocRows((rows) => rows.slice(0, -1))}
                    >
                      Usuń ostatni
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <Field label="Projekt">
                <ProjectSearchPicker
                  value={editing.projectId ?? null}
                  onChange={(id) => setEditing({ ...editing, projectId: id })}
                  disabled={saving}
                />
                {!editing.projectId && (editing.projectName ?? "").trim() ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Legacy: „{(editing.projectName ?? "").trim()}” — wybierz projekt z listy, aby powiązać rekord.
                  </p>
                ) : null}
              </Field>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={vatOnlyPayment}
              onChange={(e) => {
                const on = e.target.checked;
                setVatOnlyPayment(on);
                if (on) {
                  setAmountEntryMode("net");
                  setEditing((prev) => {
                    const raw = prev.vatAmount?.trim();
                    const hasVat = raw && Number(normalizeDecimalInput(raw)) > 0;
                    const vatStr = hasVat ? normalizeDecimalInput(raw!) : "";
                    return {
                      ...prev,
                      netAmount: "0",
                      vatRate: 0,
                      vatAmount: vatStr,
                      grossAmount: vatStr,
                      paymentSource: prev.paymentSource === "MAIN" ? "VAT" : prev.paymentSource,
                    };
                  });
                } else {
                  setAmountEntryMode("net");
                  setEditing((prev) => {
                    const net =
                      prev.netAmount && Number(normalizeDecimalInput(prev.netAmount)) > 0
                        ? prev.netAmount
                        : "1";
                    const rate = (prev.vatRate === 0 ? 23 : prev.vatRate) as VatRatePct;
                    const a = amountsFromNetRate(net, rate);
                    return { ...prev, netAmount: net, vatRate: rate, vatAmount: a.vatAmount, grossAmount: a.grossAmount };
                  });
                }
              }}
              disabled={saving}
            />
            Płatność tylko VAT (netto 0, brutto = kwota VAT — np. zapłata samego VAT z konta VAT)
          </label>
          {vatOnlyPayment ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Kwota netto">
                <Input value="0" readOnly disabled className="bg-zinc-50 dark:bg-zinc-900" />
              </Field>
              <Field label="Stawka VAT">
                <Select value="0" disabled>
                  <option value="0">0% (tryb tylko VAT)</option>
                </Select>
              </Field>
              <Field label="Kwota VAT">
                <Input
                  value={editing.vatAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditing((prev) => ({ ...prev, vatAmount: v, grossAmount: v }));
                  }}
                  required
                  disabled={saving}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </Field>
              <Field label="Brutto">
                <Input
                  readOnly
                  className="bg-zinc-50 dark:bg-zinc-900"
                  value={editing.grossAmount}
                  disabled={saving}
                />
              </Field>
            </div>
          ) : (
            <InvoiceAmountFields
              mode={amountEntryMode}
              onModeChange={handleAmountModeChange}
              netAmount={editing.netAmount}
              vatRate={editing.vatRate}
              vatAmount={editing.vatAmount}
              grossAmount={editing.grossAmount}
              disabled={saving}
              onNetChange={(net) => {
                setEditing((prev) => {
                  const a = amountsFromNetRate(net, prev.vatRate as VatRatePct);
                  return { ...prev, netAmount: net, ...a };
                });
              }}
              onGrossChange={(gross) => {
                setEditing((prev) => {
                  const a = amountsFromGrossRate(gross, prev.vatRate as VatRatePct);
                  return { ...prev, grossAmount: gross, netAmount: a.netAmount, vatAmount: a.vatAmount };
                });
              }}
              onVatRateChange={(rate) => {
                setEditing((prev) => {
                  if (amountEntryMode === "gross") {
                    const a = amountsFromGrossRate(prev.grossAmount, rate);
                    return { ...prev, vatRate: rate, netAmount: a.netAmount, vatAmount: a.vatAmount };
                  }
                  const a = amountsFromNetRate(prev.netAmount, rate);
                  return { ...prev, vatRate: rate, ...a };
                });
              }}
            />
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Data dokumentu">
              <Input
                type="date"
                value={editing.documentDate ?? ""}
                onChange={(e) => setEditing({ ...editing, documentDate: e.target.value })}
                required
                disabled={saving}
              />
            </Field>
            <Field label="Termin płatności">
              <Input
                type="date"
                value={editing.paymentDueDate ?? ""}
                onChange={(e) => applyPaymentDue(e.target.value)}
                required
                disabled={saving}
              />
              <DueDateOffsetControls
                baseYmd={editing.documentDate ?? ""}
                disabled={saving}
                onApplyDue={applyPaymentDue}
              />
            </Field>
            <Field label="Planowana data zapłaty">
              <Input
                type="date"
                value={editing.plannedPaymentDate ?? ""}
                onChange={(e) => {
                  plannedPaymentManualRef.current = true;
                  setEditing({ ...editing, plannedPaymentDate: e.target.value });
                }}
                required
                disabled={saving}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} disabled={saving}>
                <option value="PLANOWANA">Planowana</option>
                <option value="DO_ZAPLATY">Do zapłaty</option>
                <option value="PARTIALLY_PAID">Częściowo zapłacona</option>
                <option value="ZAPLACONA">Zapłacona</option>
              </Select>
            </Field>
            <Field label="Źródło płatności">
              <Select
                value={editing.paymentSource}
                onChange={(e) => setEditing({ ...editing, paymentSource: e.target.value })}
                disabled={saving}
              >
                <option value="MAIN">Tylko konto główne (MAIN)</option>
                <option value="VAT">Tylko konto VAT</option>
                <option value="VAT_THEN_MAIN">Najpierw VAT (kwota VAT), reszta z MAIN</option>
              </Select>
            </Field>
          </div>
          <Field label="Data faktycznej zapłaty (jeśli zapłacono)">
            <Input
              type="date"
              value={editing.actualPaymentDate ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setEditing({ ...editing, actualPaymentDate: v || null });
              }}
              disabled={saving}
            />
          </Field>
          {editing.isGeneratedFromRecurring ? (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-zinc-300"
                checked={!!editing.isRecurringDetached}
                onChange={(e) => setEditing({ ...editing, isRecurringDetached: e.target.checked })}
                disabled={saving}
              />
              <span>
                Odłącz od reguły cyklicznej — zmiany reguły nie nadpiszą tego dokumentu przy synchronizacji.
              </span>
            </label>
          ) : null}
          <Field label="Notatki">
            <Textarea
              rows={2}
              value={editing.notes}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              disabled={saving}
            />
          </Field>
          {editing.id ? (
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Płatności (brutto)</span>
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1.5 !text-xs"
                  onClick={() => {
                    setFormError(null);
                    const inv = editing as unknown as CostInvoice;
                    const pays = (editing.payments ?? []) as unknown as PayPick[];
                    const remaining = costRemainingGross(inv, pays);
                    const amt =
                      remaining > 0 ? String(remaining) : (Number(editing.grossAmount) > 0 ? String(editing.grossAmount) : "");
                    setPayProjectManual(false);
                    setPayDraft({
                      amountGross: amt,
                      paymentDate: todayYmd(),
                      notes: "",
                    });
                    setPayProjectRows(
                      costInvoiceMultiProject(editing) && amt ? prefillPaymentProjectRows(editing, amt) : [],
                    );
                    setPayOpen(true);
                  }}
                  disabled={saving}
                >
                  Dodaj płatność
                </Button>
              </div>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                Częściowe lub rozłożone w czasie — dodawaj płatności ręcznie. Pełne rozliczenie możesz ustawić statusem
                „Zapłacona”: brakująca kwota zapisze się tu automatycznie (data z faktycznej zapłaty lub planowanej).
              </p>
              {(() => {
                const inv = editing as unknown as CostInvoice;
                const pays = (editing.payments ?? []) as unknown as PayPick[];
                const g = Number(editing.grossAmount) || 0;
                const settled = sumCostPaymentsGross(pays);
                const remaining = costRemainingGross(inv, pays);
                const pct = g > 0 ? Math.round((settled / g) * 1000) / 10 : 0;
                return (
                  <div className="mb-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                    <div>
                      Rozliczono: {formatMoney(settled)} / brutto {formatMoney(g)} · Pozostało: {formatMoney(remaining)} ·{" "}
                      {pct}% dokumentu
                    </div>
                    <div>
                      Status: {statusBadge(editing.status)} · Kwota dokumentu: {formatMoney(g)}
                    </div>
                  </div>
                );
              })()}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="py-1 pr-2">Kwota</th>
                      <th className="py-1 pr-2">Data</th>
                      <th className="py-1 pr-2">Notatka</th>
                      <th className="py-1 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {((editing.payments ?? []) as { id: string; amountGross: string; paymentDate: string; notes: string }[])
                      .length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-2 text-zinc-500">
                          Brak płatności
                        </td>
                      </tr>
                    ) : (
                      ((editing.payments ?? []) as { id: string; amountGross: string; paymentDate: string; notes: string }[]).map(
                        (p) => (
                          <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800">
                            <td className="py-1.5 pr-2 tabular-nums">{formatMoney(Number(p.amountGross))}</td>
                            <td className="py-1.5 pr-2">{formatDate(p.paymentDate)}</td>
                            <td className="py-1.5 pr-2">{p.notes || "—"}</td>
                            <td className="py-1.5 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                className="!py-0.5 !text-xs text-red-600"
                                onClick={() => deletePayment(p.id)}
                                disabled={saving}
                              >
                                Usuń
                              </Button>
                            </td>
                          </tr>
                        ),
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <div>
              {editing.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="!text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  disabled={saving}
                  onClick={() => void removeFromEdit()}
                >
                  Usuń dokument
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner className="!size-4" /> : null}
                Zapisz
              </Button>
              <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
                Anuluj
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal open={payOpen} title="Nowa płatność" onClose={() => setPayOpen(false)}>
        <form onSubmit={submitPayment} className="space-y-3">
          {formError && payOpen ? <Alert variant="error">{formError}</Alert> : null}
          <Field label="Kwota brutto">
            <Input
              value={payDraft.amountGross}
              onChange={(e) => {
                const v = e.target.value;
                setPayDraft({ ...payDraft, amountGross: v });
                if (!payProjectManual && costInvoiceMultiProject(editing) && v.trim()) {
                  setPayProjectRows(prefillPaymentProjectRows(editing, v));
                }
              }}
              required
              disabled={paySaving}
            />
          </Field>
          {costInvoiceMultiProject(editing) && payProjectRows.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Podział na projekty (brutto)</span>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-zinc-300"
                    checked={payProjectManual}
                    onChange={(e) => setPayProjectManual(e.target.checked)}
                    disabled={paySaving}
                  />
                  Ręczny
                </label>
              </div>
              <p className="mb-2 text-xs text-zinc-500">
                Domyślnie proporcje jak w alokacji dokumentu. Zaznacz „Ręczny”, aby poprawić kwoty.
              </p>
              <div className="space-y-2">
                {payProjectRows.map((row, idx) => {
                  const name =
                    editing.projectAllocations?.find((a) => a.projectId === row.projectId)?.project?.name ??
                    projects.find((p) => p.id === row.projectId)?.name ??
                    row.projectId;
                  return (
                    <div key={`${row.projectId}-${idx}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-[120px] flex-1 font-medium text-zinc-800 dark:text-zinc-200">{name}</span>
                      <Input
                        className="max-w-[140px]"
                        value={row.grossAmount}
                        disabled={paySaving || !payProjectManual}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPayProjectRows((rows) => rows.map((x, i) => (i === idx ? { ...x, grossAmount: val } : x)));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-2 !text-xs"
                disabled={paySaving}
                onClick={() => {
                  setPayProjectManual(false);
                  setPayProjectRows(prefillPaymentProjectRows(editing, payDraft.amountGross || "0"));
                }}
              >
                Przelicz wg proporcji dokumentu
              </Button>
            </div>
          ) : null}
          <Field label="Data płatności">
            <Input
              type="date"
              value={payDraft.paymentDate}
              onChange={(e) => setPayDraft({ ...payDraft, paymentDate: e.target.value })}
              required
              disabled={paySaving}
            />
          </Field>
          <Field label="Notatka">
            <Input
              value={payDraft.notes}
              onChange={(e) => setPayDraft({ ...payDraft, notes: e.target.value })}
              disabled={paySaving}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={paySaving}>
              {paySaving ? <Spinner className="!size-4" /> : null}
              Zapisz płatność
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPayOpen(false)} disabled={paySaving}>
              Anuluj
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
