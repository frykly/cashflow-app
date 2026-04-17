"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectSearchPicker } from "@/components/ProjectSearchPicker";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { CrudToolbar } from "@/components/CrudToolbar";
import { formatDate, formatMoney, toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { readApiErrorBody } from "@/lib/api-client";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { useListQuery } from "@/hooks/useListQuery";
import { isCalendarOverdue } from "@/lib/cashflow/overdue";
import { projectLinkTargetId, projectListLabel } from "@/lib/project-display";
import { postCreateReturnFromSearchParams, type PostCreateReturnCapture } from "@/lib/safe-internal-return-path";

type ProjectOption = { id: string; name: string; isActive: boolean; code?: string | null };

type Row = {
  id: string;
  type: string;
  title: string;
  description: string;
  amount: string;
  amountVat?: string | null;
  plannedDate?: string | null;
  status: string;
  notes: string;
  incomeCategoryId?: string | null;
  expenseCategoryId?: string | null;
  incomeCategory?: { id: string; name: string; slug: string } | null;
  expenseCategory?: { id: string; name: string; slug: string } | null;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
  projectName?: string | null;
  convertedToIncomeInvoice?: { id: string; invoiceNumber: string } | null;
  convertedToCostInvoice?: { id: string; documentNumber: string } | null;
  projectAllocations?: {
    id: string;
    projectId: string;
    amount: unknown;
    amountVat: unknown;
    description: string;
    project?: { id: string; name: string } | null;
  }[];
};

type Draft = Omit<Row, "id"> & { id?: string };

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return {
    type: "EXPENSE",
    title: "",
    description: "",
    amount: "0",
    amountVat: "0",
    plannedDate: todayYmd(),
    status: "PLANNED",
    notes: "",
    incomeCategoryId: null,
    expenseCategoryId: null,
    projectId: null,
  };
}

function statusBadge(s: string) {
  if (s === "CONVERTED") return <Badge variant="success">Skonwertowane na fakturę</Badge>;
  if (s === "DONE") return <Badge variant="success">Zrealizowane</Badge>;
  if (s === "CANCELLED") return <Badge variant="danger">Anulowane</Badge>;
  return <Badge variant="warning">Zaplanowane</Badge>;
}

function typeBadge(t: string) {
  if (t === "INCOME") return <span className="text-emerald-700 dark:text-emerald-400">Wpływ</span>;
  return <span className="text-red-700 dark:text-red-400">Wydatek</span>;
}

function plannedRowOverdue(r: Row): boolean {
  if (r.status !== "PLANNED") return false;
  if (!r.plannedDate) return false;
  return isCalendarOverdue(new Date(r.plannedDate));
}

const SORT_OPTIONS = [
  { value: "plannedDate", label: "Planowana data" },
  { value: "title", label: "Tytuł" },
  { value: "type", label: "Typ" },
  { value: "amount", label: "Kwota" },
  { value: "status", label: "Status" },
  { value: "createdAt", label: "Data utworzenia" },
];

type Cat = { id: string; name: string; slug: string; isActive?: boolean };

function categoryCell(r: Row): string {
  if (r.type === "INCOME") return r.incomeCategory?.name ?? "—";
  return r.expenseCategory?.name ?? "—";
}

function formatPlannedAmountCell(r: Row): string {
  const main = Number(r.amount);
  const vat = r.amountVat != null ? Number(r.amountVat) : 0;
  if (vat > 0) return `${formatMoney(main)} gł. + ${formatMoney(vat)} VAT`;
  return formatMoney(main);
}

export function PlannedEventsClient({ initialQueryString = "" }: { initialQueryString?: string }) {
  const router = useRouter();
  const { queryString, setParam, setParams, merged } = useListQuery("planned", initialQueryString);
  const postCreateReturnRef = useRef<PostCreateReturnCapture>({ returnTo: null, sourceProjectId: null });
  const [rows, setRows] = useState<Row[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [incomeCats, setIncomeCats] = useState<Cat[]>([]);
  const [expenseCats, setExpenseCats] = useState<Cat[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectAllocMode, setProjectAllocMode] = useState<"simple" | "multi">("simple");
  const [projectAllocRows, setProjectAllocRows] = useState<
    { projectId: string; amount: string; amountVat: string; description: string }[]
  >([]);

  const expenseCatsForForm = useMemo(() => {
    const sel = editing.expenseCategoryId;
    return expenseCats.filter((c) => c.isActive !== false || c.id === sel);
  }, [expenseCats, editing.expenseCategoryId]);

  const [filterDraft, setFilterDraft] = useState({
    q: "",
    status: "",
    type: "",
    categoryId: "",
    projectId: "",
    dateFrom: "",
    dateTo: "",
    overdueOnly: false,
  });

  useEffect(() => {
    const m = new URLSearchParams(queryString);
    setFilterDraft({
      q: m.get("q") ?? "",
      status: m.get("status") ?? "",
      type: m.get("type") ?? "",
      categoryId: m.get("categoryId") ?? "",
      projectId: m.get("projectId") ?? "",
      dateFrom: m.get("dateFrom") ?? "",
      dateTo: m.get("dateTo") ?? "",
      overdueOnly: m.get("overdue") === "1",
    });
  }, [queryString]);

  useEffect(() => {
    Promise.all([
      fetch("/api/income-categories").then((r) => r.json()),
      fetch("/api/expense-categories").then((r) => r.json()),
    ])
      .then(([i, e]) => {
        setIncomeCats(Array.isArray(i) ? i : []);
        setExpenseCats(Array.isArray(e) ? e : []);
      })
      .catch(() => {
        setIncomeCats([]);
        setExpenseCats([]);
      });
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
      const r = await fetch(`/api/planned-events?${queryString}`);
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
      type: filterDraft.type || null,
      categoryId: filterDraft.categoryId || null,
      projectId: filterDraft.projectId || null,
      dateFrom: filterDraft.dateFrom || null,
      dateTo: filterDraft.dateTo || null,
      overdue: filterDraft.overdueOnly ? "1" : null,
    });
  }

  function clearFilters() {
    setParams({
      q: null,
      status: null,
      type: null,
      categoryId: null,
      projectId: null,
      dateFrom: null,
      dateTo: null,
      overdue: null,
    });
  }

  const sort = merged.get("sort") ?? "plannedDate";
  const order = (merged.get("order") === "desc" ? "desc" : "asc") as "asc" | "desc";

  function clickHeaderSort(key: string) {
    if (!SORT_OPTIONS.some((o) => o.value === key)) return;
    if (sort === key) setParam("order", order === "asc" ? "desc" : "asc");
    else setParams({ sort: key, order: "asc" });
  }

  function plannedSortTh(label: string, sortKey: string, align: "left" | "right" = "left") {
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
    postCreateReturnRef.current = { returnTo: null, sourceProjectId: null };
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
  }

  function openNew() {
    postCreateReturnRef.current = { returnTo: null, sourceProjectId: null };
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
    setEditing(emptyDraft());
    setFormError(null);
    setOpen(true);
  }

  function openEdit(r: Row) {
    setEditing({
      ...r,
      incomeCategoryId: r.incomeCategoryId ?? null,
      expenseCategoryId: r.expenseCategoryId ?? null,
      plannedDate: isoToDateInputValue(r.plannedDate),
      amount: String(r.amount),
      amountVat: r.amountVat != null ? String(r.amountVat) : "0",
    });
    const pa = r.projectAllocations;
    if (pa && pa.length > 0) {
      setProjectAllocMode("multi");
      setProjectAllocRows(
        pa.map((a) => ({
          projectId: a.projectId,
          amount: String(a.amount),
          amountVat: String(a.amountVat ?? "0"),
          description: a.description ?? "",
        })),
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

  const listQs = merged.toString();
  useEffect(() => {
    const m = new URLSearchParams(listQs);
    const editPlanned = m.get("editPlanned");
    const wantNew = m.get("new") === "1";
    const prefillPid = m.get("projectId")?.trim() || null;
    if (!editPlanned && !wantNew) return;
    let cancelled = false;
    void (async () => {
      if (editPlanned) {
        const r = await fetch(`/api/planned-events/${editPlanned}`);
        const j = await r.json();
        if (cancelled) return;
        if (r.ok) openEditRef.current(j as Row);
        queueMicrotask(() =>
          setParams({
            editPlanned: null,
            new: null,
            projectId: null,
            clientName: null,
            projectName: null,
            projectCode: null,
            returnTo: null,
          }),
        );
        return;
      }
      if (wantNew) {
        if (cancelled) return;
        postCreateReturnRef.current = postCreateReturnFromSearchParams(m);
        const d = emptyDraft();
        if (prefillPid) d.projectId = prefillPid;
        const pn = m.get("projectName")?.trim();
        const pc = m.get("projectCode")?.trim();
        if (pn || pc) {
          d.title = pn ? `Projekt: ${pn}` : d.title;
          if (pc) d.description = d.description ? `${d.description} · Numer zlecenia: ${pc}` : `Numer zlecenia: ${pc}`;
        }
        setProjectAllocMode("simple");
        setProjectAllocRows([]);
        setEditing(d);
        setFormError(null);
        setOpen(true);
        queueMicrotask(() =>
          setParams({
            editPlanned: null,
            new: null,
            projectId: null,
            clientName: null,
            projectName: null,
            projectCode: null,
            returnTo: null,
          }),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listQs, setParams]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const plannedDate = toIsoOrNull(String(editing.plannedDate ?? ""));
    if (!plannedDate) {
      setFormError("Ustaw poprawną planowaną datę.");
      setSaving(false);
      return;
    }
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
            amount: normalizeDecimalInput(row.amount),
            amountVat: normalizeDecimalInput(row.amountVat ?? "0"),
            description: row.description.trim(),
          })),
        };
      }
      if (editing.id) return { projectAllocations: [] as never[] };
      return {};
    })();

    const projectField =
      projectAllocMode === "multi" ? { projectId: null } : { projectId: projectIdPayload };

    const body = {
      type: editing.type,
      title: editing.title,
      description: editing.description,
      amount: normalizeDecimalInput(editing.amount),
      amountVat: normalizeDecimalInput(editing.amountVat ?? "0"),
      plannedDate,
      status: editing.status,
      notes: editing.notes,
      ...projectField,
      incomeCategoryId: editing.type === "INCOME" ? (editing.incomeCategoryId || null) : null,
      expenseCategoryId: editing.type === "EXPENSE" ? (editing.expenseCategoryId || null) : null,
      ...allocPart,
    };
    const url = editing.id ? `/api/planned-events/${editing.id}` : "/api/planned-events";
    const method = editing.id ? "PATCH" : "POST";
    const isCreate = !editing.id;
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
      if (isCreate) {
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

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportMsg(null);
    const fd = new FormData();
    fd.set("file", f);
    try {
      const res = await fetch("/api/planned-events/import", { method: "POST", body: fd });
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

  async function remove(id: string) {
    if (!confirm("Usunąć to zdarzenie?")) return;
    const res = await fetch(`/api/planned-events/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    load();
  }

  const overdueFilterActive = merged.get("overdue") === "1";
  const formLocked = editing.status === "CONVERTED";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Planowane zdarzenia</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Wpływy i wydatki bez faktury — kwota na koncie głównym w prognozie.
            {overdueFilterActive ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <Badge variant="warning">Po terminie</Badge>
                <Link href="/planned-events" className="text-zinc-600 underline dark:text-zinc-400">
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
          <Field label="Szukaj (tytuł, opis, projekt)">
            <Input
              value={filterDraft.q}
              onChange={(e) => setFilterDraft((d) => ({ ...d, q: e.target.value }))}
              placeholder="np. leasing lub nazwa projektu"
              disabled={listLoading}
            />
          </Field>
          <Field label="Status">
            <Select
              value={filterDraft.status}
              onChange={(e) => setFilterDraft((d) => ({ ...d, status: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">(wszystkie)</option>
              <option value="PLANNED">Zaplanowane</option>
              <option value="DONE">Zrealizowane</option>
              <option value="CANCELLED">Anulowane</option>
            </Select>
          </Field>
          <Field label="Typ">
            <Select
              value={filterDraft.type}
              onChange={(e) => setFilterDraft((d) => ({ ...d, type: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">(wszystkie)</option>
              <option value="INCOME">Wpływ</option>
              <option value="EXPENSE">Wydatek</option>
            </Select>
          </Field>
          <Field label="Kategoria">
            <Select
              value={filterDraft.categoryId}
              onChange={(e) => setFilterDraft((d) => ({ ...d, categoryId: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">(wszystkie)</option>
              <optgroup label="Przychody">
                {incomeCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Koszty">
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </Select>
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
          <Field label="Data od (plan.)">
            <Input
              type="date"
              value={filterDraft.dateFrom}
              onChange={(e) => setFilterDraft((d) => ({ ...d, dateFrom: e.target.value }))}
              disabled={listLoading}
            />
          </Field>
          <Field label="Data do (plan.)">
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
          Tylko po terminie (status zaplanowane, data &lt; dziś)
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          <Link href="/planned-events?overdue=1" className="font-medium text-zinc-700 underline dark:text-zinc-300">
            Szybki link: tylko przeterminowane
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-700">
          <span className="font-medium text-zinc-600 dark:text-zinc-400">Eksport (z filtrami):</span>
          <a className="text-zinc-800 underline dark:text-zinc-200" href={`/api/planned-events/export?format=csv&${queryString}`}>
            CSV
          </a>
          <a className="text-zinc-800 underline dark:text-zinc-200" href={`/api/planned-events/export?format=xlsx&${queryString}`}>
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
                <th className="sticky top-0 z-20 w-[22%] border-b border-zinc-200 bg-zinc-50 px-2 py-2 pl-3 dark:border-zinc-800 dark:bg-zinc-900">
                  {plannedSortTh("Tytuł", "title")}
                </th>
                <th className="sticky top-0 z-20 w-[9%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {plannedSortTh("Typ", "type")}
                </th>
                <th className="sticky top-0 z-20 w-[14%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Kategoria
                </th>
                <th className="sticky top-0 z-20 w-[14%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Projekt
                </th>
                <th className="sticky top-0 z-20 w-[11%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {plannedSortTh("Data", "plannedDate")}
                </th>
                <th className="sticky top-0 z-20 w-[12%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {plannedSortTh("Kwota", "amount", "right")}
                </th>
                <th className="sticky top-0 z-20 w-[12%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {plannedSortTh("Status", "status")}
                </th>
                <th className="sticky top-0 z-20 w-[6%] border-b border-zinc-200 bg-zinc-50 px-2 py-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
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
                  Brak zdarzeń. Dodaj pierwsze z poziomu przycisku <strong>Dodaj</strong>.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const overdue = plannedRowOverdue(r);
                return (
                  <tr
                    key={r.id}
                    className={`bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/80 ${
                      overdue ? "border-l-4 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20" : ""
                    }`}
                  >
                    <td className="min-w-0 px-2 py-2 pl-3">
                      <div className="flex flex-wrap items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100">
                        {r.title}
                        {overdue ? <Badge variant="warning">Po terminie</Badge> : null}
                      </div>
                      {r.description ? (
                        <div className="mt-0.5 line-clamp-2 text-xs text-zinc-500" title={r.description}>
                          {r.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="min-w-0 px-1 py-2 font-medium">{typeBadge(r.type)}</td>
                    <td className="min-w-0 truncate px-1 py-2 text-xs text-zinc-600 dark:text-zinc-400" title={categoryCell(r)}>
                      {categoryCell(r)}
                    </td>
                    <td className="min-w-0 px-1 py-2 text-xs">
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
                          >
                            {label}
                          </Link>
                        ) : label !== "—" ? (
                          <span className="line-clamp-2 break-words text-zinc-700 dark:text-zinc-300">{label}</span>
                        ) : (
                          <span className="text-zinc-500 dark:text-zinc-400">—</span>
                        );
                      })()}
                    </td>
                    <td className="min-w-0 whitespace-nowrap px-1 py-2 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {formatDate(r.plannedDate)}
                    </td>
                    <td className="min-w-0 px-1 py-2 text-right text-sm tabular-nums font-medium">{formatPlannedAmountCell(r)}</td>
                    <td className="min-w-0 px-1 py-2">{statusBadge(r.status)}</td>
                    <td className="min-w-0 px-2 py-2 pr-3 text-right whitespace-nowrap">
                      <Button variant="ghost" className="!py-1 text-xs" onClick={() => openEdit(r)}>
                        Edytuj
                      </Button>
                      <Button variant="ghost" className="!py-1 text-xs text-red-600 dark:text-red-400" onClick={() => remove(r.id)}>
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
        title={editing.id ? "Edycja zdarzenia" : "Nowe zdarzenie"}
        onClose={closeModal}
        size="lg"
      >
        <form onSubmit={save} className="space-y-3">
          {formError && <Alert variant="error">{formError}</Alert>}
          {formLocked ? (
            <Alert variant="info">
              To zdarzenie zostało skonwertowane na fakturę — edycja jest wyłączona (w tym przypisanie i alokacja na
              projekty).
              {editing.convertedToIncomeInvoice ? (
                <span className="mt-2 block">
                  <Link
                    href={`/income-invoices?editIncome=${editing.convertedToIncomeInvoice.id}`}
                    className="font-medium underline"
                  >
                    Otwórz fakturę przychodową {editing.convertedToIncomeInvoice.invoiceNumber}
                  </Link>
                </span>
              ) : null}
              {editing.convertedToCostInvoice ? (
                <span className="mt-2 block">
                  <Link
                    href={`/cost-invoices?editCost=${editing.convertedToCostInvoice.id}`}
                    className="font-medium underline"
                  >
                    Otwórz fakturę kosztową {editing.convertedToCostInvoice.documentNumber}
                  </Link>
                </span>
              ) : null}
            </Alert>
          ) : null}
          <Field label="Tytuł">
            <Input
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              required
              disabled={saving || formLocked}
            />
          </Field>
          <Field label="Opis">
            <Textarea
              rows={2}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              disabled={saving || formLocked}
            />
          </Field>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300"
                checked={projectAllocMode === "multi"}
                disabled={saving || formLocked}
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
                            amount: editing.amount,
                            amountVat: editing.amountVat ?? "0",
                            description: "",
                          },
                        ];
                      }
                      return [
                        {
                          projectId: "",
                          amount: editing.amount,
                          amountVat: editing.amountVat ?? "0",
                          description: "",
                        },
                      ];
                    });
                  } else {
                    setProjectAllocRows([]);
                  }
                }}
              />
              Alokacja na kilka projektów (suma kwot gł. i VAT = dokument)
            </label>
            {projectAllocMode === "multi" ? (
              <div className="mt-3 space-y-2">
                {projectAllocRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <Field label="Projekt">
                      <ProjectSearchPicker
                        value={row.projectId.trim() || null}
                        onChange={(id) =>
                          setProjectAllocRows((rows) =>
                            rows.map((x, i) => (i === idx ? { ...x, projectId: id ?? "" } : x)),
                          )
                        }
                        listSort="code"
                        disabled={saving || formLocked}
                      />
                    </Field>
                    <Field label="Kwota gł. (alokacja)">
                      <Input
                        value={row.amount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, amount: v } : x)));
                        }}
                        disabled={saving || formLocked}
                      />
                    </Field>
                    <Field label="VAT (alokacja)">
                      <Input
                        value={row.amountVat}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, amountVat: v } : x)));
                        }}
                        disabled={saving || formLocked}
                      />
                    </Field>
                    <Field label="Notatka (opcjonalnie)">
                      <Input
                        value={row.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, description: v } : x)));
                        }}
                        disabled={saving || formLocked}
                      />
                    </Field>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-xs"
                    disabled={saving || formLocked}
                    onClick={() =>
                      setProjectAllocRows((rows) => [
                        ...rows,
                        {
                          projectId: "",
                          amount: editing.amount,
                          amountVat: editing.amountVat ?? "0",
                          description: "",
                        },
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
                      disabled={saving || formLocked}
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
                  disabled={saving || formLocked}
                />
                {!editing.projectId && (editing.projectName ?? "").trim() ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Legacy: „{(editing.projectName ?? "").trim()}” — wybierz projekt z listy, aby powiązać rekord.
                  </p>
                ) : null}
              </Field>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Typ">
              <Select
                value={editing.type}
                onChange={(e) => {
                  const t = e.target.value;
                  setEditing({
                    ...editing,
                    type: t,
                    incomeCategoryId: t === "INCOME" ? editing.incomeCategoryId : null,
                    expenseCategoryId: t === "EXPENSE" ? editing.expenseCategoryId : null,
                  });
                }}
                disabled={saving || formLocked}
              >
                <option value="INCOME">Wpływ (INCOME)</option>
                <option value="EXPENSE">Wydatek (EXPENSE)</option>
              </Select>
            </Field>
            <Field label="Kwota — konto główne (PLN)">
              <Input
                value={editing.amount}
                onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                required
                disabled={saving || formLocked}
              />
            </Field>
          </div>
          <Field label="Kwota — konto VAT (PLN, opcjonalnie)">
            <Input
              value={editing.amountVat ?? "0"}
              onChange={(e) => setEditing({ ...editing, amountVat: e.target.value })}
              disabled={saving || formLocked}
              placeholder="0"
            />
          </Field>
          {editing.type === "INCOME" ? (
            <Field label="Kategoria przychodu">
              <Select
                value={editing.incomeCategoryId ?? ""}
                onChange={(e) => setEditing({ ...editing, incomeCategoryId: e.target.value || null })}
                disabled={saving || formLocked}
              >
                <option value="">(brak)</option>
                {incomeCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Kategoria kosztu">
              <Select
                value={editing.expenseCategoryId ?? ""}
                onChange={(e) => setEditing({ ...editing, expenseCategoryId: e.target.value || null })}
                disabled={saving || formLocked}
              >
                <option value="">(brak)</option>
                {expenseCatsForForm.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isActive === false ? " (zarchiwizowana)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Planowana data">
            <Input
              type="date"
              value={editing.plannedDate ?? ""}
              onChange={(e) => setEditing({ ...editing, plannedDate: e.target.value })}
              required
              disabled={saving || formLocked}
            />
          </Field>
          <Field label="Status">
            {editing.status === "CONVERTED" ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100">
                Skonwertowane na fakturę — edycja statusu jest zablokowana.
              </p>
            ) : (
              <Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} disabled={saving || formLocked}>
                <option value="PLANNED">Zaplanowane — uwzględnij w prognozie</option>
                <option value="DONE">Zrealizowane</option>
                <option value="CANCELLED">Anulowane — pomiń</option>
              </Select>
            )}
          </Field>
          {editing.id && editing.status === "PLANNED" ? (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 dark:border-indigo-900/40 dark:bg-indigo-950/30">
              <p className="text-xs font-medium text-indigo-900 dark:text-indigo-200">Konwersja na fakturę</p>
              <p className="mt-1 text-xs text-indigo-800/90 dark:text-indigo-300/90">
                Otworzy formularz z uzupełnionymi danymi; po zapisaniu faktury to zdarzenie zostanie oznaczone jako skonwertowane.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {editing.type === "INCOME" ? (
                  <Link
                    href={`/income-invoices?new=1&convertPlannedEventId=${editing.id}`}
                    className="inline-flex items-center rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-900 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-zinc-900 dark:text-indigo-100 dark:hover:bg-zinc-800"
                  >
                    Utwórz fakturę przychodową
                  </Link>
                ) : (
                  <Link
                    href={`/cost-invoices?new=1&convertPlannedEventId=${editing.id}`}
                    className="inline-flex items-center rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-900 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-zinc-900 dark:text-indigo-100 dark:hover:bg-zinc-800"
                  >
                    Utwórz fakturę kosztową
                  </Link>
                )}
              </div>
            </div>
          ) : null}
          <Field label="Notatki">
            <Textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} disabled={saving || formLocked} />
          </Field>
          <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <Button type="submit" disabled={saving || formLocked}>
              {saving ? <Spinner className="!size-4" /> : null}
              Zapisz
            </Button>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Anuluj
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
