"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
import type { IncomeInvoice, IncomeInvoicePayment } from "@prisma/client";

type PayPick = Pick<IncomeInvoicePayment, "amountGross">;
import { incomeRemainingGross, isIncomeFullyPaid, sumIncomePaymentsGross } from "@/lib/cashflow/settlement";
import { DueDateOffsetControls } from "@/components/DueDateOffsetControls";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { projectDisplayLabel } from "@/lib/project-display";

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
  payments?: { id: string; amountGross: string; paymentDate: string; notes: string }[];
  isGeneratedFromRecurring?: boolean;
  isRecurringDetached?: boolean;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  projectName?: string | null;
};

type Draft = Omit<Row, "id"> & { id?: string };

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
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

const SORT_OPTIONS = [
  { value: "plannedIncomeDate", label: "Plan. wpływ" },
  { value: "paymentDueDate", label: "Termin płatności" },
  { value: "issueDate", label: "Data wystawienia" },
  { value: "createdAt", label: "Data utworzenia" },
];

const DATE_FIELD_OPTIONS = [
  { value: "plannedIncomeDate", label: "Plan. wpływ" },
  { value: "paymentDueDate", label: "Termin płatności" },
  { value: "issueDate", label: "Data wystawienia" },
];

type Cat = { id: string; name: string; slug: string };

export function IncomeInvoicesClient() {
  const { queryString, setParam, setParams, merged } = useListQuery("income");
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
  const [paySaving, setPaySaving] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [contractorSuggestions, setContractorSuggestions] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  /** Po ręcznej zmianie planowanej daty wpływu — nie nadpisuj przy zmianie terminu płatności. */
  const plannedIncomeManualRef = useRef(false);
  const [amountEntryMode, setAmountEntryMode] = useState<AmountEntryMode>("net");

  const [filterDraft, setFilterDraft] = useState({
    q: "",
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
      q: m.get("q") ?? "",
      status: m.get("status") ?? "",
      categoryId: m.get("categoryId") ?? "",
      recurringSource: m.get("recurringSource") ?? "",
      projectId: m.get("projectId") ?? "",
      dateFrom: m.get("dateFrom") ?? "",
      dateTo: m.get("dateTo") ?? "",
      dateField: m.get("dateField") || "plannedIncomeDate",
      overdueOnly: m.get("overdue") === "1",
    });
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

  useEffect(() => {
    if (!open) return;
    void fetch("/api/income-invoices/suggestions")
      .then((r) => r.json())
      .then((j: { names?: string[] }) => setContractorSuggestions(Array.isArray(j?.names) ? j.names : []))
      .catch(() => setContractorSuggestions([]));
  }, [open]);

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
      q: filterDraft.q.trim() || null,
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

  function clearFilters() {
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

  function closeModal() {
    setOpen(false);
    setFormError(null);
    setPayOpen(false);
  }

  function openNew() {
    plannedIncomeManualRef.current = false;
    setAmountEntryMode("net");
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
    });
    setFormError(null);
    setOpen(true);
  }

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
    setPaySaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/income-invoices/${editing.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountGross: normalizeDecimalInput(payDraft.amountGross),
          paymentDate: pd,
          notes: payDraft.notes,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      setPayOpen(false);
      setPayDraft({ amountGross: "", paymentDate: "", notes: "" });
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
      projectId: projectIdPayload,
      incomeCategoryId: editing.incomeCategoryId || null,
      ...recurringPatch,
    };
    const url = editing.id ? `/api/income-invoices/${editing.id}` : "/api/income-invoices";
    const method = editing.id ? "PATCH" : "POST";
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
      load();
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Usunąć tę fakturę?")) return;
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
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
          <Field label="Szukaj (nr, kontrahent, opis, projekt)">
            <Input
              value={filterDraft.q}
              onChange={(e) => setFilterDraft((d) => ({ ...d, q: e.target.value }))}
              placeholder="np. FV/1, kontrahent lub projekt"
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
          Tylko po terminie (nieopłacone, data &lt; dziś)
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          <Link href="/income-invoices?overdue=1" className="font-medium text-zinc-700 underline dark:text-zinc-300">
            Szybki link: tylko przeterminowane
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-700">
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Eksport (z filtrami):</span>
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
      </div>

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <div className="max-h-[min(70vh,56rem)] overflow-auto overscroll-x-contain">
          <table className="w-full min-w-[1340px] border-separate border-spacing-0 text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Numer
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Źródło
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Kontrahent
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Kategoria
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Projekt
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Netto
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Plan. wpływ
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Rozliczenie
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Brutto
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Rozliczono
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Pozostało
                </th>
                <th className="sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-3 py-2.5 font-semibold dark:border-zinc-800 dark:bg-zinc-900">
                  Status
                </th>
                <th className="sticky top-0 right-0 z-30 border-b border-l border-zinc-200 bg-zinc-50 px-3 py-2.5 text-right font-semibold shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.12)] dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.4)]">
                  Akcje
                </th>
              </tr>
            </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {listLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-12 text-center text-zinc-500">
                  <Spinner className="mr-2 inline !size-5" />
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-3 py-12 text-center text-zinc-500">
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
                    className={`group cursor-pointer bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/80 ${
                      overdue ? "border-l-4 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20" : ""
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-xs font-medium">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        {r.invoiceNumber}
                        {overdue ? <Badge variant="warning">Po terminie</Badge> : null}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{recurringSourceBadge(r)}</td>
                    <td className="max-w-[200px] truncate px-3 py-2" title={r.contractor}>
                      {r.contractor}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-zinc-600 dark:text-zinc-400" title={r.incomeCategory?.name}>
                      {r.incomeCategory?.name ?? "—"}
                    </td>
                    <td
                      className="max-w-[120px] truncate px-3 py-2 text-zinc-600 dark:text-zinc-400"
                      title={projectDisplayLabel(r) || undefined}
                    >
                      {projectDisplayLabel(r) || "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(Number(r.netAmount))}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.plannedIncomeDate)}</td>
                    <td className="px-3 py-2 text-xs">{r.vatDestination === "MAIN" ? "Całe brutto → MAIN" : "Netto MAIN, VAT → VAT"}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">{formatMoney(Number(r.grossAmount))}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-800 dark:text-emerald-300">
                      {formatMoney(settled)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(remaining)}</td>
                    <td className="px-3 py-2">{statusBadge(r.status)}</td>
                    <td
                      className={`sticky right-0 z-10 border-l border-zinc-200 px-3 py-2 text-right whitespace-nowrap shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.08)] transition-colors dark:border-zinc-800 dark:shadow-[-6px_0_12px_-6px_rgba(0,0,0,0.35)] ${
                        overdue
                          ? "bg-amber-50/95 group-hover:bg-amber-50 dark:bg-amber-950/50 dark:group-hover:bg-amber-950/40"
                          : "bg-white group-hover:bg-zinc-50 dark:bg-zinc-950 dark:group-hover:bg-zinc-900/80"
                      }`}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        className="!py-1 text-xs"
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
                        className="!py-1 text-xs text-red-600 dark:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(r.id);
                        }}
                      >
                        Usuń
                      </Button>
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
        title={editing.id ? "Edycja faktury przychodowej" : "Nowa faktura przychodowa"}
        onClose={closeModal}
        size="lg"
      >
        <form onSubmit={save} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          {formError && <Alert variant="error">{formError}</Alert>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Numer faktury">
              <Input
                value={editing.invoiceNumber}
                onChange={(e) => setEditing({ ...editing, invoiceNumber: e.target.value })}
                required
                disabled={saving}
              />
            </Field>
            <Field label="Kontrahent">
              <NameAutocomplete
                listId="income-contractor-suggestions"
                suggestions={contractorSuggestions}
                value={editing.contractor}
                onChange={(e) => setEditing({ ...editing, contractor: e.target.value })}
                required
                disabled={saving}
              />
            </Field>
          </div>
          <Field label="Kategoria przychodu">
            <Select
              value={editing.incomeCategoryId ?? ""}
              onChange={(e) => setEditing({ ...editing, incomeCategoryId: e.target.value || null })}
              disabled={saving}
            >
              <option value="">(brak)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
          <Field label="Projekt">
            <Select
              value={editing.projectId ?? ""}
              onChange={(e) => setEditing({ ...editing, projectId: e.target.value || null })}
              disabled={saving}
            >
              <option value="">(brak)</option>
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
            {!editing.projectId && (editing.projectName ?? "").trim() ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Legacy: „{(editing.projectName ?? "").trim()}” — wybierz projekt z listy, aby powiązać rekord.
              </p>
            ) : null}
          </Field>
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
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Data wystawienia">
              <Input
                type="date"
                value={editing.issueDate ?? ""}
                onChange={(e) => setEditing({ ...editing, issueDate: e.target.value })}
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
                baseYmd={editing.issueDate ?? ""}
                disabled={saving}
                onApplyDue={applyPaymentDue}
              />
            </Field>
            <Field label="Planowana data wpływu">
              <Input
                type="date"
                value={editing.plannedIncomeDate ?? ""}
                onChange={(e) => {
                  plannedIncomeManualRef.current = true;
                  setEditing({ ...editing, plannedIncomeDate: e.target.value });
                }}
                required
                disabled={saving}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                disabled={saving}
              >
                <option value="PLANOWANA">Planowana</option>
                <option value="WYSTAWIONA">Wystawiona</option>
                <option value="PARTIALLY_RECEIVED">Częściowo opłacona</option>
                <option value="OPLACONA">Opłacona</option>
              </Select>
            </Field>
            <Field label="Rozliczenie VAT (konto docelowe)">
              <Select
                value={editing.vatDestination}
                onChange={(e) => setEditing({ ...editing, vatDestination: e.target.value })}
                disabled={saving}
              >
                <option value="MAIN">MAIN — całe brutto na konto główne</option>
                <option value="VAT">VAT — netto na MAIN, VAT na konto VAT</option>
              </Select>
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={editing.confirmedIncome}
              onChange={(e) => setEditing({ ...editing, confirmedIncome: e.target.checked })}
              disabled={saving}
            />
            Wpływ potwierdzony (informacyjnie)
          </label>
          <Field label="Data faktycznego wpływu (gdy status: opłacona)">
            <Input
              type="date"
              value={editing.actualIncomeDate ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setEditing({ ...editing, actualIncomeDate: v || null });
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
                Odłącz od reguły cyklicznej — zmiany reguły nie nadpiszą tej faktury przy synchronizacji.
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
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Wpłaty (brutto)</span>
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1.5 !text-xs"
                  onClick={() => {
                    setFormError(null);
                    setPayDraft({
                      amountGross: "",
                      paymentDate: todayYmd(),
                      notes: "",
                    });
                    setPayOpen(true);
                  }}
                  disabled={saving}
                >
                  Dodaj wpłatę
                </Button>
              </div>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                Częściowe lub rozłożone w czasie — dodawaj wpłaty ręcznie. Pełne rozliczenie możesz ustawić statusem
                „Opłacona”: brakująca kwota zapisze się tu automatycznie (data z faktycznego wpływu lub planowanego).
              </p>
              {(() => {
                const inv = editing as unknown as IncomeInvoice;
                const pays = (editing.payments ?? []) as unknown as PayPick[];
                const g = Number(editing.grossAmount) || 0;
                const settled = sumIncomePaymentsGross(pays);
                const remaining = incomeRemainingGross(inv, pays);
                const pct = g > 0 ? Math.round((settled / g) * 1000) / 10 : 0;
                return (
                  <div className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
                    Rozliczono: {formatMoney(settled)} / brutto {formatMoney(g)} · Pozostało: {formatMoney(remaining)} ·{" "}
                    {pct}% dokumentu
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
                          Brak wpłat
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
          <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="!size-4" /> : null}
              Zapisz
            </Button>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Anuluj
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={payOpen} title="Nowa wpłata" onClose={() => setPayOpen(false)}>
        <form onSubmit={submitPayment} className="space-y-3">
          {formError && payOpen ? <Alert variant="error">{formError}</Alert> : null}
          <Field label="Kwota brutto">
            <Input
              value={payDraft.amountGross}
              onChange={(e) => setPayDraft({ ...payDraft, amountGross: e.target.value })}
              required
              disabled={paySaving}
            />
          </Field>
          <Field label="Data wpłaty">
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
              Zapisz wpłatę
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
