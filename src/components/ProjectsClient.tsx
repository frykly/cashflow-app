"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { NameAutocomplete } from "@/components/NameAutocomplete";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import { decToNumber } from "@/lib/cashflow/money";
import { isoToDateInputValue } from "@/lib/date-input";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { formatMoney, toIsoOrNull } from "@/lib/format";
import {
  PROJECT_LIFECYCLE_VALUES,
  PROJECT_SETTLEMENT_VALUES,
  projectLifecycleLabel,
  projectSettlementLabel,
} from "@/lib/project-status-labels";

type SortKey = "code" | "name" | "clientName" | "plannedRevenueNet" | "plannedCostNet" | "paidTotal" | "actualResult";

type Row = {
  id: string;
  name: string;
  code: string | null;
  clientName: string | null;
  description: string | null;
  isActive: boolean;
  lifecycleStatus?: string | null;
  settlementStatus?: string | null;
  plannedRevenueNet?: unknown;
  plannedCostNet?: unknown;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Tylko na liście z `/api/projects`; pojedynczy GET może ich nie mieć */
  paidTotalGross?: number;
  actualResultNet?: number | null;
};

type Draft = {
  id?: string;
  name: string;
  code: string | null;
  clientName: string | null;
  description: string | null;
  isActive: boolean;
  lifecycleStatus: string | null;
  settlementStatus: string | null;
  plannedRevenueNet: string;
  plannedCostNet: string;
  startDate: string;
  endDate: string;
};

function emptyDraft(): Draft {
  return {
    name: "",
    code: null,
    clientName: null,
    description: null,
    isActive: true,
    lifecycleStatus: null,
    settlementStatus: null,
    plannedRevenueNet: "",
    plannedCostNet: "",
    startDate: "",
    endDate: "",
  };
}

function moneyCell(v: unknown): string {
  if (v == null || v === "") return "—";
  return formatMoney(decToNumber(v as string | number));
}

export function ProjectsClient({ initialEditId = null }: { initialEditId?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "1" | "0">("");
  const [includeSettled, setIncludeSettled] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [contractorSuggestions, setContractorSuggestions] = useState<string[]>([]);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(searchInput.trim()), 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const sp = new URLSearchParams();
      if (qDebounced) sp.set("q", qDebounced);
      if (activeFilter === "1") sp.set("active", "true");
      if (activeFilter === "0") sp.set("active", "false");
      if (includeSettled) sp.set("includeSettled", "1");
      sp.set("sort", sortKey);
      sp.set("order", sortOrder);
      const qs = sp.toString();
      const r = await fetch(`/api/projects${qs ? `?${qs}` : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(readApiErrorBody(j));
      setRows(Array.isArray(j) ? j : []);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : "Nie udało się wczytać projektów");
    } finally {
      setLoading(false);
    }
  }, [qDebounced, activeFilter, includeSettled, sortKey, sortOrder]);

  useEffect(() => {
    load();
  }, [load]);

  function sortIndicator(order: "asc" | "desc") {
    return order === "asc" ? " ↑" : " ↓";
  }

  function clickSort(key: SortKey) {
    if (sortKey === key) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortOrder("asc");
    }
  }

  function headerBtn(label: string, key: SortKey) {
    const active = sortKey === key;
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-0.5 font-semibold hover:text-zinc-950 dark:hover:text-zinc-50 ${
          active ? "text-zinc-950 dark:text-zinc-50" : "text-zinc-700 dark:text-zinc-300"
        }`}
        onClick={() => clickSort(key)}
      >
        {label}
        {active ? sortIndicator(sortOrder) : null}
      </button>
    );
  }

  useEffect(() => {
    if (!open) return;
    void fetch("/api/income-invoices/suggestions")
      .then((r) => r.json())
      .then((j: { names?: string[] }) => setContractorSuggestions(Array.isArray(j?.names) ? j.names : []))
      .catch(() => setContractorSuggestions([]));
  }, [open]);

  useEffect(() => {
    const edit = initialEditId;
    if (!edit) return;
    let cancelled = false;
    (async () => {
      const r = await fetch(`/api/projects/${edit}`);
      const j = await r.json();
      if (cancelled) return;
      const m = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      m.delete("edit");
      router.replace(m.toString() ? `${pathname}?${m}` : pathname, { scroll: false });
      if (!r.ok) return;
      const p = j as Row;
      openEdit(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialEditId, pathname, router]);

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
      id: r.id,
      name: r.name,
      code: r.code,
      clientName: r.clientName,
      description: r.description,
      isActive: r.isActive,
      lifecycleStatus: r.lifecycleStatus ?? null,
      settlementStatus: r.settlementStatus ?? null,
      plannedRevenueNet: r.plannedRevenueNet != null ? String(r.plannedRevenueNet) : "",
      plannedCostNet: r.plannedCostNet != null ? String(r.plannedCostNet) : "",
      startDate: r.startDate ? isoToDateInputValue(r.startDate) : "",
      endDate: r.endDate ? isoToDateInputValue(r.endDate) : "",
    });
    setFormError(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const body = {
      name: editing.name.trim(),
      code: editing.code?.trim() || null,
      clientName: editing.clientName?.trim() || null,
      description: editing.description?.trim() || null,
      isActive: editing.isActive,
      lifecycleStatus: editing.lifecycleStatus?.trim() || null,
      settlementStatus: editing.settlementStatus?.trim() || null,
      plannedRevenueNet: editing.plannedRevenueNet?.trim() ? normalizeDecimalInput(editing.plannedRevenueNet) : null,
      plannedCostNet: editing.plannedCostNet?.trim() ? normalizeDecimalInput(editing.plannedCostNet) : null,
      startDate: editing.startDate?.trim() ? toIsoOrNull(editing.startDate) : null,
      endDate: editing.endDate?.trim() ? toIsoOrNull(editing.endDate) : null,
    };
    if (!body.name) {
      setFormError("Podaj nazwę projektu.");
      setSaving(false);
      return;
    }
    const url = editing.id ? `/api/projects/${editing.id}` : "/api/projects";
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
    if (!confirm("Usunąć ten projekt? W dokumentach pole projektu zostanie wyczyszczone.")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Projekty</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Przypisuj projekty do kosztów, przychodów i zdarzeń planowanych. Wersja MVP — bez powiązań z regułami cyklicznymi.
          </p>
        </div>
        <Button type="button" onClick={openNew} disabled={loading}>
          Dodaj projekt
        </Button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Szukaj (nazwa, kod, klient)">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="np. budowa"
              autoComplete="off"
            />
          </Field>
          <Field label="Status">
            <Select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as "" | "1" | "0")} disabled={loading}>
              <option value="">Wszystkie</option>
              <option value="1">Aktywne</option>
              <option value="0">Nieaktywne</option>
            </Select>
          </Field>
          <Field label="Lista">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300"
                checked={includeSettled}
                onChange={(e) => setIncludeSettled(e.target.checked)}
              />
              Pokaż zakończone i rozliczone
            </label>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="button" className="w-full sm:w-auto" onClick={() => load()} disabled={loading}>
              Odśwież
            </Button>
          </div>
        </div>
      </div>

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2.5">{headerBtn("Nazwa", "name")}</th>
              <th className="px-3 py-2.5">{headerBtn("Numer zlecenia", "code")}</th>
              <th className="px-3 py-2.5">{headerBtn("Klient", "clientName")}</th>
              <th className="px-3 py-2.5 text-right">{headerBtn("Plan przychód", "plannedRevenueNet")}</th>
              <th className="px-3 py-2.5 text-right">{headerBtn("Plan koszt", "plannedCostNet")}</th>
              <th className="px-3 py-2.5 text-right">{headerBtn("Zapłacone", "paidTotal")}</th>
              <th className="px-3 py-2.5 text-right">{headerBtn("Wynik rzecz.", "actualResult")}</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-zinc-500">
                  <Spinner className="mr-2 inline !size-5" />
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-zinc-500">
                  Brak projektów. Użyj <strong>Dodaj projekt</strong>.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    <Link href={`/projects/${r.id}`} className="underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:decoration-zinc-600">
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.code ?? "—"}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-zinc-600 dark:text-zinc-400" title={r.clientName ?? undefined}>
                    {r.clientName ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{moneyCell(r.plannedRevenueNet)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{moneyCell(r.plannedCostNet)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatMoney(r.paidTotalGross ?? 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {r.actualResultNet == null ? "—" : formatMoney(r.actualResultNet)}
                  </td>
                  <td className="px-3 py-2">
                    {r.isActive ? <Badge variant="success">Aktywny</Badge> : <Badge variant="muted">Nieaktywny</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link
                      href={`/projects/${r.id}`}
                      className="mr-1 inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Podgląd
                    </Link>
                    <Button variant="ghost" className="!py-1 text-xs" onClick={() => openEdit(r)}>
                      Edytuj
                    </Button>
                    <Button variant="ghost" className="!py-1 text-xs text-red-600 dark:text-red-400" onClick={() => remove(r.id)}>
                      Usuń
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing.id ? "Edycja projektu" : "Nowy projekt"} onClose={closeModal} size="lg">
        <form onSubmit={save} className="space-y-3">
          {formError && <Alert variant="error">{formError}</Alert>}
          <Field label="Nazwa">
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required disabled={saving} />
          </Field>
          <Field label="Numer zlecenia (opcjonalnie)">
            <Input value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value || null })} disabled={saving} />
          </Field>
          <Field label="Klient (opcjonalnie) — jak na fakturach przychodowych">
            <NameAutocomplete
              listId="project-client-suggestions"
              suggestions={contractorSuggestions}
              value={editing.clientName ?? ""}
              onChange={(e) => setEditing({ ...editing, clientName: e.target.value || null })}
              placeholder="Wybierz z listy lub wpisz nową nazwę"
              disabled={saving}
            />
          </Field>
          <Field label="Opis (opcjonalnie)">
            <Textarea rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value || null })} disabled={saving} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status realizacji">
              <Select
                value={editing.lifecycleStatus ?? ""}
                onChange={(e) => setEditing({ ...editing, lifecycleStatus: e.target.value || null })}
                disabled={saving}
              >
                <option value="">(brak)</option>
                {PROJECT_LIFECYCLE_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {projectLifecycleLabel(v)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status rozliczenia">
              <Select
                value={editing.settlementStatus ?? ""}
                onChange={(e) => setEditing({ ...editing, settlementStatus: e.target.value || null })}
                disabled={saving}
              >
                <option value="">(brak)</option>
                {PROJECT_SETTLEMENT_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {projectSettlementLabel(v)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Planowany przychód netto">
              <Input
                value={editing.plannedRevenueNet}
                onChange={(e) => setEditing({ ...editing, plannedRevenueNet: e.target.value })}
                placeholder="np. 12000"
                disabled={saving}
              />
            </Field>
            <Field label="Planowany koszt netto">
              <Input
                value={editing.plannedCostNet}
                onChange={(e) => setEditing({ ...editing, plannedCostNet: e.target.value })}
                placeholder="np. 8000"
                disabled={saving}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data rozpoczęcia">
              <Input
                type="date"
                value={editing.startDate}
                onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                disabled={saving}
              />
            </Field>
            <Field label="Data zakończenia">
              <Input
                type="date"
                value={editing.endDate}
                onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
                disabled={saving}
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={editing.isActive}
              onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              disabled={saving}
            />
            Projekt aktywny (pokazywany domyślnie na listach wyboru)
          </label>
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
