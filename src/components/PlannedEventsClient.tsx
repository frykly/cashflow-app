"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { CrudToolbar } from "@/components/CrudToolbar";
import { formatDate, formatMoney, toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { readApiErrorBody } from "@/lib/api-client";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { useListQuery } from "@/hooks/useListQuery";
import { isCalendarOverdue } from "@/lib/cashflow/overdue";
import { projectDisplayLabel } from "@/lib/project-display";

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
  { value: "createdAt", label: "Data utworzenia" },
];

type Cat = { id: string; name: string; slug: string };

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

export function PlannedEventsClient() {
  const { queryString, setParam, setParams, merged } = useListQuery("planned");
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

  function closeModal() {
    setOpen(false);
    setFormError(null);
  }

  function openNew() {
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
    setFormError(null);
    setOpen(true);
  }

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
    const body = {
      type: editing.type,
      title: editing.title,
      description: editing.description,
      amount: normalizeDecimalInput(editing.amount),
      amountVat: normalizeDecimalInput(editing.amountVat ?? "0"),
      plannedDate,
      status: editing.status,
      notes: editing.notes,
      projectId: projectIdPayload,
      incomeCategoryId: editing.type === "INCOME" ? (editing.incomeCategoryId || null) : null,
      expenseCategoryId: editing.type === "EXPENSE" ? (editing.expenseCategoryId || null) : null,
    };
    const url = editing.id ? `/api/planned-events/${editing.id}` : "/api/planned-events";
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

      <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Tytuł</th>
              <th className="px-3 py-2.5 font-semibold">Typ</th>
              <th className="px-3 py-2.5 font-semibold">Kategoria</th>
              <th className="px-3 py-2.5 font-semibold">Projekt</th>
              <th className="px-3 py-2.5 font-semibold">Data</th>
              <th className="px-3 py-2.5 font-semibold">Kwota</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Akcje</th>
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
                    <td className="max-w-[240px] px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1 font-medium text-zinc-900 dark:text-zinc-100">
                        {r.title}
                        {overdue ? <Badge variant="warning">Po terminie</Badge> : null}
                      </div>
                      {r.description ? (
                        <div className="mt-0.5 truncate text-xs text-zinc-500" title={r.description}>
                          {r.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 font-medium">{typeBadge(r.type)}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-zinc-600 dark:text-zinc-400" title={categoryCell(r)}>
                      {categoryCell(r)}
                    </td>
                    <td
                      className="max-w-[120px] truncate px-3 py-2 text-zinc-600 dark:text-zinc-400"
                      title={projectDisplayLabel(r) || undefined}
                    >
                      {projectDisplayLabel(r) || "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.plannedDate)}</td>
                    <td className="px-3 py-2 tabular-nums font-medium">{formatPlannedAmountCell(r)}</td>
                    <td className="px-3 py-2">{statusBadge(r.status)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
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

      <Modal
        open={open}
        title={editing.id ? "Edycja zdarzenia" : "Nowe zdarzenie"}
        onClose={closeModal}
        size="lg"
      >
        <form onSubmit={save} className="space-y-3">
          {formError && <Alert variant="error">{formError}</Alert>}
          <Field label="Tytuł">
            <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required disabled={saving} />
          </Field>
          <Field label="Opis">
            <Textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} disabled={saving} />
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
                disabled={saving}
              >
                <option value="INCOME">Wpływ (INCOME)</option>
                <option value="EXPENSE">Wydatek (EXPENSE)</option>
              </Select>
            </Field>
            <Field label="Kwota — konto główne (PLN)">
              <Input value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} required disabled={saving} />
            </Field>
          </div>
          <Field label="Kwota — konto VAT (PLN, opcjonalnie)">
            <Input
              value={editing.amountVat ?? "0"}
              onChange={(e) => setEditing({ ...editing, amountVat: e.target.value })}
              disabled={saving}
              placeholder="0"
            />
          </Field>
          {editing.type === "INCOME" ? (
            <Field label="Kategoria przychodu">
              <Select
                value={editing.incomeCategoryId ?? ""}
                onChange={(e) => setEditing({ ...editing, incomeCategoryId: e.target.value || null })}
                disabled={saving}
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
                disabled={saving}
              >
                <option value="">(brak)</option>
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
              disabled={saving}
            />
          </Field>
          <Field label="Status">
            <Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} disabled={saving}>
              <option value="PLANNED">Zaplanowane — uwzględnij w prognozie</option>
              <option value="DONE">Zrealizowane</option>
              <option value="CANCELLED">Anulowane — pomiń</option>
            </Select>
          </Field>
          <Field label="Notatki">
            <Textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} disabled={saving} />
          </Field>
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
    </div>
  );
}
