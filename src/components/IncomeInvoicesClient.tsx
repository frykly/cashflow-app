"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ContractorNameLink } from "@/components/ContractorNameLink";
import { Alert, Badge, Button, Field, Input, Select, Spinner } from "@/components/ui";
import { formatDate, formatMoney, toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { amountsFromGrossRate, amountsFromNetRate, inferVatRateFromAmounts, type VatRatePct } from "@/lib/vat-rate";
import type { AmountEntryMode } from "@/components/InvoiceAmountFields";
import { readApiErrorBody } from "@/lib/api-client";
import { useListQuery } from "@/hooks/useListQuery";
import { isCalendarOverdue } from "@/lib/cashflow/overdue";
import type { IncomeInvoice, IncomeInvoicePayment } from "@prisma/client";

type PayPick = Pick<IncomeInvoicePayment, "amountGross">;
import { round2 } from "@/lib/cashflow/money";
import {
  incomeRemainingGross,
  isIncomeFullyPaid,
  PAY_EPS,
  sumIncomePaymentsGross,
} from "@/lib/cashflow/settlement";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { projectLinkTargetId, projectListLabel } from "@/lib/project-display";
import { postCreateReturnFromSearchParams, type PostCreateReturnCapture } from "@/lib/safe-internal-return-path";
import { documentGrossSlicesFromInvoice } from "@/lib/payment-project-allocation/distribute-read";
import { defaultProportionalPaymentAllocationRows } from "@/lib/payment-project-allocation/default-rows";
import type { InvoicePdfDraftResponse } from "@/lib/invoice-pdf/types";
import { IncomeInvoiceFormModal } from "@/components/IncomeInvoiceFormModal";

type ProjectOption = { id: string; name: string; isActive: boolean; code?: string | null };

type Row = {
  id: string;
  invoiceNumber: string;
  contractor: string;
  description: string;
  vatRate: number;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  issueDate?: string | null;
  paymentDueDate?: string | null;
  plannedIncomeDate?: string | null;
  status: string;
  vatDestination: string;
  confirmedIncome: boolean;
  actualIncomeDate: string | null;
  notes: string;
  incomeCategoryId?: string | null;
  incomeCategory?: { id: string; name: string; slug: string } | null;
  payments?: {
    id: string;
    amountGross: string;
    paymentDate: string;
    notes: string;
    allocatedMainAmount?: string | null;
    allocatedVatAmount?: string | null;
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
  /** Harmonogram planowanych wpłat (MAIN/VAT) — nie są to rzeczywiste wpłaty. */
  plannedPayments?: {
    id?: string;
    /** Stabilny klucz React dla nowych wierszy (bez id z API). */
    clientKey?: string;
    dueDate: string;
    plannedMainAmount: string;
    plannedVatAmount: string;
    note: string;
    sortOrder: number;
    status: string;
  }[];
};

type Draft = Omit<Row, "id"> & { id?: string };

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function incomeInvoiceMultiProject(editing: Pick<Draft, "projectAllocations" | "projectId">): boolean {
  return (editing.projectAllocations?.length ?? 0) > 1;
}

/** Domyślny podział cashflow MAIN/VAT dla kwoty brutto wpłaty (faktura VAT, jeden projekt). */
function prefillIncomePaymentCashflowSplit(
  editing: Draft,
  grossStr: string,
): { main: string; vat: string } {
  if (editing.vatDestination !== "VAT" || incomeInvoiceMultiProject(editing)) {
    return { main: "", vat: "" };
  }
  const gInv = Number(editing.grossAmount);
  const pay = Number(normalizeDecimalInput(grossStr));
  if (!(gInv > 0) || !Number.isFinite(pay)) return { main: "0.00", vat: "0.00" };
  const net = Number(editing.netAmount);
  const vat = Number(editing.vatAmount);
  const ratio = pay / gInv;
  const vPart = round2(vat * ratio);
  const mPart = round2(pay - vPart);
  return { main: mPart.toFixed(2), vat: vPart.toFixed(2) };
}

function prefillIncomePaymentProjectRows(editing: Draft, amountGrossStr: string) {
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

function normalizePlannedFromApi(raw: Row["plannedPayments"] | undefined): NonNullable<Row["plannedPayments"]> {
  if (!raw?.length) return [];
  return [...raw]
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({
      id: p.id,
      clientKey: p.clientKey,
      dueDate: isoToDateInputValue(typeof p.dueDate === "string" ? p.dueDate : String(p.dueDate)),
      plannedMainAmount: String(p.plannedMainAmount ?? "0"),
      plannedVatAmount: String(p.plannedVatAmount ?? "0"),
      note: p.note ?? "",
      sortOrder: p.sortOrder ?? 0,
      status: p.status ?? "PLANNED",
    }));
}

function newPlanRow(sortOrder: number): NonNullable<Row["plannedPayments"]>[number] {
  const ck =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `ck-${sortOrder}-${Date.now()}`;
  return {
    clientKey: ck,
    dueDate: todayYmd(),
    plannedMainAmount: "0",
    plannedVatAmount: "0",
    note: "",
    sortOrder,
    status: "PLANNED",
  };
}

function emptyDraft(): Draft {
  const { vatAmount, grossAmount } = amountsFromNetRate("0", 23);
  return {
    invoiceNumber: "",
    contractor: "",
    description: "",
    vatRate: 23,
    netAmount: "0",
    vatAmount,
    grossAmount,
    issueDate: todayYmd(),
    paymentDueDate: todayYmd(),
    plannedIncomeDate: todayYmd(),
    status: "PLANOWANA",
    vatDestination: "MAIN",
    confirmedIncome: false,
    actualIncomeDate: null,
    notes: "",
    incomeCategoryId: null,
    projectId: null,
    plannedPayments: [],
  };
}

function statusBadge(s: string) {
  if (s === "OPLACONA") return <Badge variant="success">Opłacona</Badge>;
  if (s === "PARTIALLY_RECEIVED") return <Badge variant="warning">Częściowo</Badge>;
  if (s === "WYSTAWIONA") return <Badge variant="warning">Wystawiona</Badge>;
  return <Badge variant="muted">Planowana</Badge>;
}

function recurringSourceBadge(r: Row) {
  if (!r.isGeneratedFromRecurring) return <Badge variant="muted">Ręczne</Badge>;
  if (r.isRecurringDetached) return <Badge variant="warning">Cykliczne · odłączone</Badge>;
  return <Badge variant="default">Cykliczne</Badge>;
}

function incomeRowOverdue(r: Row): boolean {
  const inv = r as unknown as IncomeInvoice;
  const pays = (r.payments ?? []) as unknown as PayPick[];
  if (isIncomeFullyPaid(inv, pays)) return false;
  const now = new Date();
  if (!r.plannedIncomeDate || !r.paymentDueDate) return false;
  return (
    isCalendarOverdue(new Date(r.plannedIncomeDate), now) || isCalendarOverdue(new Date(r.paymentDueDate), now)
  );
}

function incomeVatDestinationLong(r: Row): string {
  return r.vatDestination === "MAIN" ? "Całe brutto na konto MAIN" : "Netto na MAIN, VAT na konto VAT";
}

function incomeVatDestinationShort(r: Row): string {
  return r.vatDestination === "MAIN" ? "Brutto → MAIN" : "MAIN + VAT";
}

function IncomeListSubline({
  r,
  settled,
  remaining,
}: {
  r: Row;
  settled: number;
  remaining: number;
}) {
  const cat = r.incomeCategory?.name ?? "—";
  const vatLong = incomeVatDestinationLong(r);
  const vatShort = incomeVatDestinationShort(r);
  const note = [r.description?.trim(), r.notes?.trim()].filter(Boolean).join(" — ");
  return (
    <div className="mt-1.5 space-y-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="shrink-0 text-zinc-400">Źródło</span>
        <span className="min-w-0">{recurringSourceBadge(r)}</span>
        <span className="text-zinc-400">·</span>
        <span className="line-clamp-1 min-w-0" title={`Kategoria: ${cat}`}>
          Kat.: {cat}
        </span>
      </p>
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span title={vatLong}>VAT / rozliczenie: {vatShort}</span>
        <span className="text-zinc-400">·</span>
        <span title="Suma wpłat brutto" className="tabular-nums text-zinc-600 dark:text-zinc-300">
          Wpłynęło: {formatMoney(settled)}
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
  { value: "plannedIncomeDate", label: "Plan. wpływ" },
  { value: "paymentDueDate", label: "Termin płatności" },
  { value: "issueDate", label: "Data wystawienia" },
  { value: "invoiceNumber", label: "Numer faktury" },
  { value: "contractor", label: "Kontrahent" },
  { value: "netAmount", label: "Netto" },
  { value: "grossAmount", label: "Brutto" },
  { value: "status", label: "Status" },
  { value: "createdAt", label: "Data utworzenia" },
];

const DATE_FIELD_OPTIONS = [
  { value: "plannedIncomeDate", label: "Plan. wpływ" },
  { value: "paymentDueDate", label: "Termin płatności" },
  { value: "issueDate", label: "Data wystawienia" },
];

type Cat = { id: string; name: string; slug: string };

export function IncomeInvoicesClient({ initialQueryString = "" }: { initialQueryString?: string }) {
  const router = useRouter();
  const { queryString, setParam, setParams, merged } = useListQuery("income", initialQueryString);
  const [rows, setRows] = useState<Row[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfDraftNote, setPdfDraftNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payDraft, setPayDraft] = useState({ amountGross: "", paymentDate: "", notes: "" });
  const [payProjectRows, setPayProjectRows] = useState<{ projectId: string; grossAmount: string }[]>([]);
  const [payProjectManual, setPayProjectManual] = useState(false);
  const [paySplitMain, setPaySplitMain] = useState("");
  const [paySplitVat, setPaySplitVat] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  /** Wiersz planu wpłat do szybkich akcji (focus z inputów). */
  const planRowFocusIdxRef = useRef(0);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  /** Po ręcznej zmianie planowanej daty wpływu — nie nadpisuj przy zmianie terminu płatności. */
  const plannedIncomeManualRef = useRef(false);
  /** Po utworzeniu faktury z zdarzenia planowanego — wysłane w POST, potem czyszczone. */
  const sourcePlannedEventIdRef = useRef<string | null>(null);
  const postCreateReturnRef = useRef<PostCreateReturnCapture>({ returnTo: null, sourceProjectId: null });
  const [amountEntryMode, setAmountEntryMode] = useState<AmountEntryMode>("net");
  const [projectAllocMode, setProjectAllocMode] = useState<"simple" | "multi">("simple");
  const [projectAllocRows, setProjectAllocRows] = useState<
    { projectId: string; netAmount: string; grossAmount: string; description: string }[]
  >([]);

  const isEditingSearchRef = useRef(false);

  const [searchDraft, setSearchDraft] = useState(() => {
    const m = new URLSearchParams(initialQueryString);
    return m.get("q") ?? "";
  });
  const [filterDraft, setFilterDraft] = useState({
    status: "",
    categoryId: "",
    recurringSource: "",
    projectId: "",
    dateFrom: "",
    dateTo: "",
    dateField: "plannedIncomeDate",
    overdueOnly: false,
  });

  useEffect(() => {
    const m = new URLSearchParams(queryString);
    setFilterDraft({
      status: m.get("status") ?? "",
      categoryId: m.get("categoryId") ?? "",
      recurringSource: m.get("recurringSource") ?? "",
      projectId: m.get("projectId") ?? "",
      dateFrom: m.get("dateFrom") ?? "",
      dateTo: m.get("dateTo") ?? "",
      dateField: m.get("dateField") || "plannedIncomeDate",
      overdueOnly: m.get("overdue") === "1",
    });
    if (!isEditingSearchRef.current) {
      setSearchDraft(m.get("q") ?? "");
    }
  }, [queryString]);

  useEffect(() => {
    fetch("/api/income-categories")
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

  const load = useCallback(async () => {
    setListLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/income-invoices?${queryString}`);
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
      q: searchDraft.trim() || null,
      status: filterDraft.status || null,
      categoryId: filterDraft.categoryId || null,
      recurringSource: filterDraft.recurringSource || null,
      projectId: filterDraft.projectId || null,
      dateFrom: filterDraft.dateFrom || null,
      dateTo: filterDraft.dateTo || null,
      dateField: filterDraft.dateField,
      overdue: filterDraft.overdueOnly ? "1" : null,
    });
  }

  useEffect(() => {
    const currentQ = new URLSearchParams(queryString).get("q") ?? "";
    if (searchDraft.trim() === currentQ) return;
    const t = window.setTimeout(() => {
      setParam("q", searchDraft.trim() || null);
    }, 500);
    return () => window.clearTimeout(t);
  }, [searchDraft, queryString, setParam]);

  function clearFilters() {
    isEditingSearchRef.current = false;
    setSearchDraft("");
    setParams({
      q: null,
      status: null,
      categoryId: null,
      recurringSource: null,
      projectId: null,
      dateFrom: null,
      dateTo: null,
      dateField: null,
      overdue: null,
    });
  }

  const sort = merged.get("sort") ?? "plannedIncomeDate";
  const order = (merged.get("order") === "desc" ? "desc" : "asc") as "asc" | "desc";

  function clickHeaderSort(key: string) {
    if (!SORT_OPTIONS.some((o) => o.value === key)) return;
    if (sort === key) setParam("order", order === "asc" ? "desc" : "asc");
    else setParams({ sort: key, order: "asc" });
  }

  function incomeSortTh(label: string, sortKey: string, align: "left" | "right" = "left") {
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
    setPdfDraftNote(null);
    setPayOpen(false);
    sourcePlannedEventIdRef.current = null;
    postCreateReturnRef.current = { returnTo: null, sourceProjectId: null };
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
  }

  function openNew() {
    plannedIncomeManualRef.current = false;
    sourcePlannedEventIdRef.current = null;
    postCreateReturnRef.current = { returnTo: null, sourceProjectId: null };
    setAmountEntryMode("net");
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
    setEditing(emptyDraft());
    setFormError(null);
    setPdfDraftNote(null);
    setOpen(true);
  }

  function applyIncomePdfDraft(res: InvoicePdfDraftResponse) {
    console.log("[invoice-pdf-e2e-ui-before]", res);
    const v = res.values;
    setEditing((prev) => {
      const next = { ...prev };
      if (v.invoiceNumber?.trim()) next.invoiceNumber = v.invoiceNumber.trim();
      if (v.contractor?.trim()) next.contractor = v.contractor.trim();
      if (v.description?.trim()) next.description = v.description.trim();
      if (v.issueDate) next.issueDate = v.issueDate;
      if (v.paymentDueDate) {
        next.paymentDueDate = v.paymentDueDate;
        next.plannedIncomeDate = v.paymentDueDate;
      }
      if (v.documentDate && !v.issueDate) next.issueDate = v.documentDate;
      if (v.netAmount) next.netAmount = v.netAmount;
      if (v.vatAmount) next.vatAmount = v.vatAmount;
      if (v.grossAmount) next.grossAmount = v.grossAmount;
      if (v.vatRate != null && v.netAmount && v.vatAmount) next.vatRate = v.vatRate;
      console.log("[invoice-pdf-e2e-ui-after]", {
        net: next.netAmount,
        vat: next.vatAmount,
        gross: next.grossAmount,
      });
      return next;
    });
    if (res.values.netAmount) setAmountEntryMode("net");
    const parts: string[] = [];
    if (res.filledLabels.length) parts.push(`Uzupełniono z PDF: ${res.filledLabels.join(", ")}.`);
    for (const w of res.warnings) parts.push(w);
    setPdfDraftNote(parts.join("\n"));
    setFormError(null);
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
      if (!plannedIncomeManualRef.current) {
        next.plannedIncomeDate = dueYmd;
      }
      return next;
    });
  }

  function openEdit(r: Row) {
    const rate = (r.vatRate ??
      inferVatRateFromAmounts(Number(r.netAmount), Number(r.vatAmount))) as VatRatePct;
    const pi = isoToDateInputValue(r.plannedIncomeDate);
    const pd = isoToDateInputValue(r.paymentDueDate);
    plannedIncomeManualRef.current = pi !== pd;
    setAmountEntryMode("net");
    setEditing({
      ...r,
      isGeneratedFromRecurring: !!r.isGeneratedFromRecurring,
      isRecurringDetached: !!r.isRecurringDetached,
      vatRate: rate,
      incomeCategoryId: r.incomeCategoryId ?? null,
      issueDate: isoToDateInputValue(r.issueDate),
      paymentDueDate: isoToDateInputValue(r.paymentDueDate),
      plannedIncomeDate: isoToDateInputValue(r.plannedIncomeDate),
      actualIncomeDate: r.actualIncomeDate ? isoToDateInputValue(r.actualIncomeDate) : null,
      netAmount: String(r.netAmount),
      vatAmount: String(r.vatAmount),
      grossAmount: String(r.grossAmount),
      plannedPayments: normalizePlannedFromApi(r.plannedPayments),
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
    } else {
      setProjectAllocMode("simple");
      setProjectAllocRows([]);
    }
    setFormError(null);
    setPdfDraftNote(null);
    setOpen(true);
  }

  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  const stripInvoiceDeepLinkParams = {
    editIncome: null as string | null,
    new: null as string | null,
    projectId: null as string | null,
    clientName: null as string | null,
    projectName: null as string | null,
    projectCode: null as string | null,
    convertPlannedEventId: null as string | null,
    returnTo: null as string | null,
  };

  const listQs = merged.toString();
  useEffect(() => {
    const m = new URLSearchParams(listQs);
    const editIncome = m.get("editIncome");
    const wantNew = m.get("new") === "1";
    const convertPlanned = m.get("convertPlannedEventId")?.trim() || null;
    const prefillPid = m.get("projectId")?.trim() || null;
    const prefillClient = m.get("clientName")?.trim() || "";
    const prefillProjectName = m.get("projectName")?.trim() || "";
    const prefillProjectCode = m.get("projectCode")?.trim() || "";
    if (!editIncome && !wantNew && !convertPlanned) return;
    let cancelled = false;
    void (async () => {
      if (editIncome) {
        const r = await fetch(`/api/income-invoices/${editIncome}`);
        const j = await r.json();
        if (cancelled) return;
        if (r.ok) openEditRef.current(j as Row);
        queueMicrotask(() => setParams(stripInvoiceDeepLinkParams));
        return;
      }
      if (convertPlanned) {
        const r = await fetch(`/api/planned-events/${convertPlanned}`);
        const ev = await r.json();
        if (cancelled) return;
        if (!r.ok || ev.status !== "PLANNED" || ev.type !== "INCOME") {
          alert("Nie można utworzyć faktury z tego zdarzenia (wymagane: status „Zaplanowane”, typ przychód).");
          queueMicrotask(() => setParams(stripInvoiceDeepLinkParams));
          return;
        }
        postCreateReturnRef.current = postCreateReturnFromSearchParams(m);
        let contractor = prefillClient;
        if (!contractor && ev.projectId) {
          const pr = await fetch(`/api/projects/${ev.projectId}`);
          const pj = await pr.json();
          if (pr.ok && pj?.clientName) contractor = String(pj.clientName).trim();
        }
        plannedIncomeManualRef.current = false;
        setAmountEntryMode("net");
        const pd = isoToDateInputValue(ev.plannedDate);
        const net = String(ev.amount ?? "0");
        const rate = 23 as VatRatePct;
        const a = amountsFromNetRate(net, rate);
        const d: Draft = {
          ...emptyDraft(),
          invoiceNumber: `ZPL-${ev.id.slice(0, 10)}`,
          contractor,
          description: ev.title ? `Z planu: ${ev.title}` : "",
          netAmount: net,
          vatAmount: a.vatAmount,
          grossAmount: a.grossAmount,
          vatRate: rate,
          issueDate: pd,
          paymentDueDate: pd,
          plannedIncomeDate: pd,
          projectId: ev.projectId || prefillPid || null,
          incomeCategoryId: ev.incomeCategoryId || null,
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
        queueMicrotask(() => setParams(stripInvoiceDeepLinkParams));
        return;
      }
      if (wantNew) {
        if (cancelled) return;
        postCreateReturnRef.current = postCreateReturnFromSearchParams(m);
        plannedIncomeManualRef.current = false;
        setAmountEntryMode("net");
        const d = emptyDraft();
        if (prefillPid) d.projectId = prefillPid;
        if (prefillClient) d.contractor = prefillClient;
        if (prefillProjectName || prefillProjectCode) {
          const parts = [prefillProjectName && `Projekt: ${prefillProjectName}`, prefillProjectCode && `Numer zlecenia: ${prefillProjectCode}`].filter(
            Boolean,
          ) as string[];
          if (parts.length) d.description = parts.join(" · ");
        }
        setEditing(d);
        setFormError(null);
        setOpen(true);
        queueMicrotask(() => setParams(stripInvoiceDeepLinkParams));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listQs, setParams]);

  async function refreshPaymentsForInvoice(id: string) {
    const r = await fetch(`/api/income-invoices/${id}`);
    const j = await r.json();
    if (!r.ok) return;
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...j } : row)));
    setEditing((prev) => {
      if (prev.id !== id) return prev;
      plannedIncomeManualRef.current =
        isoToDateInputValue(j.plannedIncomeDate) !== isoToDateInputValue(j.paymentDueDate);
      return {
        ...prev,
        ...j,
        isGeneratedFromRecurring: !!j.isGeneratedFromRecurring,
        isRecurringDetached: !!j.isRecurringDetached,
        incomeCategoryId: j.incomeCategoryId ?? null,
        vatRate: j.vatRate ?? prev.vatRate,
        issueDate: isoToDateInputValue(j.issueDate),
        paymentDueDate: isoToDateInputValue(j.paymentDueDate),
        plannedIncomeDate: isoToDateInputValue(j.plannedIncomeDate),
        actualIncomeDate: j.actualIncomeDate ? isoToDateInputValue(j.actualIncomeDate) : null,
        netAmount: String(j.netAmount),
        vatAmount: String(j.vatAmount),
        grossAmount: String(j.grossAmount),
        plannedPayments: normalizePlannedFromApi(j.plannedPayments as Row["plannedPayments"]),
      };
    });
  }

  function handleAmountModeChange(m: AmountEntryMode) {
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
      setFormError("Ustaw datę wpłaty.");
      return;
    }
    const gNorm = normalizeDecimalInput(payDraft.amountGross);
    if (incomeInvoiceMultiProject(editing)) {
      if (payProjectRows.length === 0) {
        setFormError("Ustaw podział brutto na projekty (dokument ma wiele alokacji).");
        return;
      }
      const sum = payProjectRows.reduce((a, r) => a + (Number(normalizeDecimalInput(r.grossAmount)) || 0), 0);
      const target = Number(gNorm);
      if (!Number.isFinite(sum) || !Number.isFinite(target) || Math.abs(sum - target) > 0.02) {
        setFormError("Suma brutto po projektach musi równać się kwocie wpłaty.");
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
      if (editing.vatDestination === "VAT" && !incomeInvoiceMultiProject(editing)) {
        body.allocatedMainAmount = normalizeDecimalInput(paySplitMain.trim() || "0");
        body.allocatedVatAmount = normalizeDecimalInput(paySplitVat.trim() || "0");
      }
      if (incomeInvoiceMultiProject(editing) && payProjectRows.length > 0) {
        body.projectAllocations = payProjectRows.map((r) => ({
          projectId: r.projectId,
          grossAmount: normalizeDecimalInput(r.grossAmount),
          description: "",
        }));
      }
      const res = await fetch(`/api/income-invoices/${editing.id}/payments`, {
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
      setPaySplitMain("");
      setPaySplitVat("");
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
    if (!confirm("Usunąć tę wpłatę?")) return;
    const res = await fetch(`/api/income-invoices/${editing.id}/payments/${pid}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    await refreshPaymentsForInvoice(editing.id);
    load();
  }

  async function savePaymentPlan() {
    if (!editing.id) return;
    setPlanSaving(true);
    setFormError(null);
    const rows = editing.plannedPayments ?? [];
    for (const r of rows) {
      if (!String(r.dueDate ?? "").trim()) {
        setFormError("Uzupełnij termin (datę) w każdym wierszu planu wpłat.");
        setPlanSaving(false);
        return;
      }
    }
    const invNet = round2(Number(normalizeDecimalInput(editing.netAmount || "0")));
    const invVat = round2(Number(normalizeDecimalInput(editing.vatAmount || "0")));
    let sumM = 0;
    let sumV = 0;
    for (const r of rows) {
      sumM = round2(sumM + Number(normalizeDecimalInput(r.plannedMainAmount || "0")));
      sumV = round2(sumV + Number(normalizeDecimalInput(r.plannedVatAmount || "0")));
    }
    if (sumM > invNet + PAY_EPS) {
      setFormError(
        `Suma MAIN w planie (${formatMoney(sumM)}) przekracza netto faktury (${formatMoney(invNet)}). Zmniejsz kwoty lub usuń wiersze.`,
      );
      setPlanSaving(false);
      return;
    }
    if (sumV > invVat + PAY_EPS) {
      setFormError(
        `Suma VAT w planie (${formatMoney(sumV)}) przekracza VAT faktury (${formatMoney(invVat)}). Zmniejsz kwoty lub usuń wiersze.`,
      );
      setPlanSaving(false);
      return;
    }
    const payload = {
      rows: rows.map((r, i) => ({
        dueDate: `${r.dueDate}T12:00:00.000Z`,
        plannedMainAmount: normalizeDecimalInput(r.plannedMainAmount || "0"),
        plannedVatAmount: normalizeDecimalInput(r.plannedVatAmount || "0"),
        note: r.note.trim(),
        sortOrder: i,
        status: r.status || "PLANNED",
      })),
    };
    try {
      const res = await fetch(`/api/income-invoices/${editing.id}/payment-plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      await refreshPaymentsForInvoice(editing.id);
      load();
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setPlanSaving(false);
    }
  }

  /** Szybkie uzupełnienie wiersza pod kursorem (focus): VAT / MAIN / reszta — wg pozostałej kwoty względem innych wierszy. */
  function applyPlanQuickFill(mode: "vat" | "main" | "rest") {
    setEditing((prev) => {
      const rows = [...(prev.plannedPayments ?? [])];
      if (rows.length === 0) rows.push(newPlanRow(0));
      const idx = Math.min(Math.max(0, planRowFocusIdxRef.current), rows.length - 1);
      const invNet = round2(Number(normalizeDecimalInput(prev.netAmount || "0")));
      const invVat = round2(Number(normalizeDecimalInput(prev.vatAmount || "0")));
      let othM = 0;
      let othV = 0;
      for (let i = 0; i < rows.length; i++) {
        if (i === idx) continue;
        othM = round2(othM + Number(normalizeDecimalInput(rows[i].plannedMainAmount || "0")));
        othV = round2(othV + Number(normalizeDecimalInput(rows[i].plannedVatAmount || "0")));
      }
      const remM = round2(Math.max(0, invNet - othM));
      const remV = round2(Math.max(0, invVat - othV));
      const cur = { ...rows[idx] };
      if (mode === "vat") {
        cur.plannedVatAmount = remV.toFixed(2);
      } else if (mode === "main") {
        cur.plannedMainAmount = remM.toFixed(2);
      } else {
        cur.plannedMainAmount = remM.toFixed(2);
        cur.plannedVatAmount = remV.toFixed(2);
      }
      rows[idx] = cur;
      return { ...prev, plannedPayments: rows.map((r, i) => ({ ...r, sortOrder: i })) };
    });
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportMsg(null);
    const fd = new FormData();
    fd.set("file", f);
    try {
      const res = await fetch("/api/income-invoices/import", { method: "POST", body: fd });
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
    const issueDate = toIsoOrNull(String(editing.issueDate ?? ""));
    const paymentDueDate = toIsoOrNull(String(editing.paymentDueDate ?? ""));
    const plannedIncomeDate = toIsoOrNull(String(editing.plannedIncomeDate ?? ""));
    if (!issueDate || !paymentDueDate || !plannedIncomeDate) {
      setFormError("Uzupełnij poprawnie datę wystawienia, termin płatności i planowaną datę wpływu.");
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

    const url = editing.id ? `/api/income-invoices/${editing.id}` : "/api/income-invoices";
    const method = editing.id ? "PATCH" : "POST";
    const body = {
      invoiceNumber: editing.invoiceNumber,
      contractor: editing.contractor,
      description: editing.description,
      vatRate: editing.vatRate,
      netAmount: normalizeDecimalInput(editing.netAmount),
      issueDate,
      paymentDueDate,
      plannedIncomeDate,
      status: editing.status,
      vatDestination: editing.vatDestination,
      confirmedIncome: editing.confirmedIncome,
      actualIncomeDate: toIsoOrNull(editing.actualIncomeDate ?? undefined),
      notes: editing.notes,
      ...projectField,
      incomeCategoryId: editing.incomeCategoryId || null,
      ...recurringPatch,
      ...allocPart,
      ...(method === "POST" && sourcePlannedEventIdRef.current
        ? { sourcePlannedEventId: sourcePlannedEventIdRef.current }
        : {}),
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
      const snap = postCreateReturnRef.current;
      closeModal();
      if (method === "POST") {
        const redirectPid =
          projectAllocMode === "multi"
            ? projectAllocRows.find((x) => x.projectId.trim())?.projectId
            : projectIdPayload;
        const dest =
          snap.returnTo ??
          (redirectPid ? `/projects/${redirectPid}` : null) ??
          (snap.sourceProjectId ? `/projects/${snap.sourceProjectId}` : null);
        if (dest) {
          router.push(dest);
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

  async function remove(id: string, opts: { skipConfirm?: boolean } = {}) {
    if (!opts.skipConfirm && !confirm("Usunąć tę fakturę?")) return;
    const res = await fetch(`/api/income-invoices/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    load();
  }

  const overdueFilterActive = merged.get("overdue") === "1";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Faktury przychodowe</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Netto, stawka VAT (0/8/23%) i daty — brutto wyliczane automatycznie. Edycja w oknie modalnym.
            {overdueFilterActive ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <Badge variant="warning">Po terminie</Badge>
                <Link href="/income-invoices" className="text-zinc-600 underline dark:text-zinc-400">
                  Wyczyść filtr
                </Link>
              </span>
            ) : null}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_8rem_auto_auto] xl:min-w-[34rem] xl:items-end">
          <Field label="Sortuj według">
            <Select value={sort} onChange={(e) => setParam("sort", e.target.value)} disabled={listLoading}>
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kolejność">
            <Select
              value={order}
              onChange={(e) => setParam("order", e.target.value as "asc" | "desc")}
              disabled={listLoading}
            >
              <option value="asc">Rosnąco</option>
              <option value="desc">Malejąco</option>
            </Select>
          </Field>
          <Button type="button" variant="secondary" className="h-[38px]" onClick={load} disabled={listLoading}>
            Odśwież
          </Button>
          <Button type="button" className="h-[38px]" onClick={openNew} disabled={listLoading}>
            Dodaj
          </Button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters();
        }}
        className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="mb-4 flex flex-col gap-3 border-b border-zinc-100 pb-3 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Filtry i wyszukiwanie</h2>
            <p className="mt-1 text-xs text-zinc-500">Szukaj po numerze, kontrahencie, opisie i projekcie.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" className="!py-1.5 !text-xs" onClick={clearFilters} disabled={listLoading}>
              Wyczyść filtry
            </Button>
            <Button type="submit" className="!py-1.5 !text-xs" disabled={listLoading}>
              Zastosuj
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1.3fr)_minmax(12rem,1fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)]">
          <Field label="Szukaj (nr, kontrahent, opis, projekt)">
            <Input
              value={searchDraft}
              onFocus={() => {
                isEditingSearchRef.current = true;
              }}
              onBlur={() => {
                isEditingSearchRef.current = false;
              }}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder="np. FV/1, kontrahent lub projekt"
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
              <option value="WYSTAWIONA">Wystawiona</option>
              <option value="PARTIALLY_RECEIVED">Częściowo opłacona</option>
              <option value="OPLACONA">Opłacona</option>
            </Select>
          </Field>
          <Field label="Kategoria">
            <Select
              value={filterDraft.categoryId}
              onChange={(e) => setFilterDraft((d) => ({ ...d, categoryId: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">(wszystkie)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
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
        </div>

        <div className="mt-4 grid gap-4 border-t border-zinc-100 pt-4 dark:border-zinc-800 lg:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.7fr)_minmax(10rem,0.7fr)_minmax(16rem,1.1fr)] lg:items-end">
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
          <label className="flex min-h-[38px] cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={filterDraft.overdueOnly}
              onChange={(e) => setFilterDraft((d) => ({ ...d, overdueOnly: e.target.checked }))}
              disabled={listLoading}
            />
            <span>Tylko po terminie</span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/60">
          <Link href="/income-invoices?overdue=1" className="font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300">
            Szybki link: tylko przeterminowane
          </Link>
          <span className="hidden text-zinc-300 dark:text-zinc-700 sm:inline">|</span>
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Eksport:</span>
          <a
            className="text-zinc-800 underline dark:text-zinc-200"
            href={`/api/income-invoices/export?format=csv&${queryString}`}
          >
            CSV
          </a>
          <a
            className="text-zinc-800 underline dark:text-zinc-200"
            href={`/api/income-invoices/export?format=xlsx&${queryString}`}
          >
            Excel
          </a>
          <label className="cursor-pointer text-zinc-800 underline dark:text-zinc-200">
            Import CSV
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onImportFile} />
          </label>
        </div>
        {importMsg ? <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{importMsg}</p> : null}
      </form>

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <div className="max-h-[min(70vh,56rem)] overflow-y-auto">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="sticky top-0 z-20 w-[14%] border-b border-zinc-200 bg-zinc-50 px-2 py-2 pl-3 dark:border-zinc-800 dark:bg-zinc-900">
                  {incomeSortTh("Numer", "invoiceNumber")}
                </th>
                <th className="sticky top-0 z-20 w-[19%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {incomeSortTh("Kontrahent", "contractor")}
                </th>
                <th className="sticky top-0 z-20 w-[14%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Projekt
                </th>
                <th className="sticky top-0 z-20 w-[9%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {incomeSortTh("Netto", "netAmount", "right")}
                </th>
                <th className="sticky top-0 z-20 w-[9%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {incomeSortTh("Brutto", "grossAmount", "right")}
                </th>
                <th className="sticky top-0 z-20 w-[11%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {incomeSortTh("Plan", "plannedIncomeDate")}
                </th>
                <th className="sticky top-0 z-20 w-[12%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {incomeSortTh("Status", "status")}
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
                  Brak faktur. Kliknij <strong>Dodaj</strong>, aby utworzyć pierwszą pozycję.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const inv = r as unknown as IncomeInvoice;
                const pays = (r.payments ?? []) as unknown as PayPick[];
                const settled = sumIncomePaymentsGross(pays);
                const remaining = incomeRemainingGross(inv, pays);
                const overdue = incomeRowOverdue(r);
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
                        <span className="break-all">{r.invoiceNumber}</span>
                        {overdue ? <Badge variant="warning">Po terminie</Badge> : null}
                      </span>
                      <IncomeListSubline r={r} settled={settled} remaining={remaining} />
                    </td>
                    <td className="min-w-0 px-1 py-2.5 text-sm text-zinc-800 dark:text-zinc-200" title={r.contractor}>
                      <span className="line-clamp-2 break-words">
                        <ContractorNameLink name={r.contractor} />
                      </span>
                    </td>
                    <td className="min-w-0 px-1 py-2.5 text-xs">
                      {(() => {
                        const hrefId = projectLinkTargetId({
                          projectAllocations: r.projectAllocations?.map((a) => ({ projectId: a.projectId })),
                          projectId: r.projectId,
                        });
                        const label = projectListLabel(r);
                        return hrefId ? (
                          <Link
                            href={`/projects/${hrefId}`}
                            className="line-clamp-2 break-words font-medium text-emerald-800 underline decoration-emerald-300 underline-offset-2 hover:decoration-emerald-600 dark:text-emerald-300 dark:decoration-emerald-700 dark:hover:decoration-emerald-400"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {label}
                          </Link>
                        ) : label !== "—" ? (
                          <span className="line-clamp-2 break-words text-zinc-700 dark:text-zinc-300">{label}</span>
                        ) : (
                          <span className="line-clamp-2 break-words text-zinc-500 dark:text-zinc-400">—</span>
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
                      {r.plannedIncomeDate ? formatDate(r.plannedIncomeDate) : "—"}
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

      <IncomeInvoiceFormModal
        open={open}
        editing={editing}
        setEditing={setEditing}
        formError={formError}
        setFormError={setFormError}
        pdfDraftNote={pdfDraftNote}
        saving={saving}
        categories={categories}
        projects={projects}
        closeModal={closeModal}
        save={save}
        applyIncomePdfDraft={applyIncomePdfDraft}
        projectAllocMode={projectAllocMode}
        setProjectAllocMode={setProjectAllocMode}
        projectAllocRows={projectAllocRows}
        setProjectAllocRows={setProjectAllocRows}
        amountEntryMode={amountEntryMode}
        handleAmountModeChange={handleAmountModeChange}
        applyPaymentDue={applyPaymentDue}
        plannedIncomeManualRef={plannedIncomeManualRef}
        planSaving={planSaving}
        newPlanRow={newPlanRow}
        savePaymentPlan={savePaymentPlan}
        applyPlanQuickFill={applyPlanQuickFill}
        planRowFocusIdxRef={planRowFocusIdxRef}
        payOpen={payOpen}
        setPayOpen={setPayOpen}
        submitPayment={submitPayment}
        payDraft={payDraft}
        setPayDraft={setPayDraft}
        paySaving={paySaving}
        payProjectManual={payProjectManual}
        setPayProjectManual={setPayProjectManual}
        payProjectRows={payProjectRows}
        setPayProjectRows={setPayProjectRows}
        paySplitMain={paySplitMain}
        setPaySplitMain={setPaySplitMain}
        paySplitVat={paySplitVat}
        setPaySplitVat={setPaySplitVat}
        todayYmd={todayYmd}
        prefillIncomePaymentCashflowSplit={prefillIncomePaymentCashflowSplit}
        prefillIncomePaymentProjectRows={prefillIncomePaymentProjectRows}
        incomeInvoiceMultiProject={incomeInvoiceMultiProject}
        deletePayment={deletePayment}
        deleteInvoice={async (id) => {
          await remove(id, { skipConfirm: true });
          closeModal();
        }}
      />
    </div>
  );
}
