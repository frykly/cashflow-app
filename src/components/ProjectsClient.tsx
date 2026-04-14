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
  lifecycleBadgeVariant,
  projectLifecycleLabel,
  projectSettlementLabel,
  settlementBadgeVariant,
} from "@/lib/project-status-labels";

type SortKey =
  | "code"
  | "name"
  | "clientName"
  | "lifecycleStatus"
  | "settlementStatus"
  | "plannedRevenueNet"
  | "plannedCostNet"
  | "paidTotal"
  | "actualResult";

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

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "Nazwa" },
  { value: "code", label: "Numer zlecenia" },
  { value: "clientName", label: "Klient" },
  { value: "lifecycleStatus", label: "Status realizacji" },
  { value: "settlementStatus", label: "Status rozliczenia" },
  { value: "plannedRevenueNet", label: "Planowany przychód" },
  { value: "plannedCostNet", label: "Planowany koszt" },
  { value: "paidTotal", label: "Zapłacone (łącznie brutto)" },
  { value: "actualResult", label: "Wynik rzeczywisty" },
];

/** Plan / zapłacone pod nazwą — nie zajmują osobnych szerokich kolumn. */
function ProjectPlanSubline({ r }: { r: Row }) {
  const planP = moneyCell(r.plannedRevenueNet);
  const planK = moneyCell(r.plannedCostNet);
  const paid = formatMoney(r.paidTotalGross ?? 0);
  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-1 gap-y-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
      <span title={`Planowany przychód netto: ${planP}`}>
        Plan przych.: <span className="tabular-nums text-zinc-600 dark:text-zinc-300">{planP}</span>
      </span>
      <span className="text-zinc-400" aria-hidden>
        ·
      </span>
      <span title={`Planowany koszt netto: ${planK}`}>
        Plan koszt: <span className="tabular-nums text-zinc-600 dark:text-zinc-300">{planK}</span>
      </span>
      <span className="text-zinc-400" aria-hidden>
        ·
      </span>
      <span title="Suma wpłat i zapłat (brutto) z faktur projektu">
        Zapłacone: <span className="tabular-nums text-zinc-600 dark:text-zinc-300">{paid}</span>
      </span>
    </p>
  );
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
        <div className="mt-3 grid gap-3 border-t border-zinc-200 pt-3 sm:grid-cols-2 dark:border-zinc-700">
          <Field label="Sortuj według">
            <Select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              disabled={loading}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Kolejność">
            <Select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
              disabled={loading}
            >
              <option value="asc">Rosnąco</option>
              <option value="desc">Malejąco</option>
            </Select>
          </Field>
        </div>
      </div>

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="w-full max-w-full rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="w-[26%] px-2 py-2.5 pl-3 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Projekt
              </th>
              <th className="w-[7%] px-1 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Kod
              </th>
              <th className="w-[13%] px-2 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Klient
              </th>
              <th className="w-[15%] px-1 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Realizacja
              </th>
              <th className="w-[15%] px-1 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Rozliczenie
              </th>
              <th
                className="w-[9%] px-2 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400"
                title="Wynik rzeczywisty (netto z faktur projektu)"
              >
                Wynik
              </th>
              <th className="w-[7%] px-1 py-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Aktywny
              </th>
              <th className="w-[8%] px-2 py-2.5 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Akcje
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                  <Spinner className="mr-2 inline !size-5" />
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                  Brak projektów. Użyj <strong>Dodaj projekt</strong>.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const lifeLabel = projectLifecycleLabel(r.lifecycleStatus);
                const setLabel = projectSettlementLabel(r.settlementStatus);
                return (
                  <tr key={r.id} className="bg-white align-top dark:bg-zinc-950">
                    <td className="min-w-0 px-2 py-2.5 pl-3">
                      <Link
                        href={`/projects/${r.id}`}
                        className="break-words font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:text-zinc-100 dark:decoration-zinc-600"
                      >
                        {r.name}
                      </Link>
                      <ProjectPlanSubline r={r} />
                    </td>
                    <td className="px-1 py-2.5 font-mono text-xs text-zinc-600 dark:text-zinc-400" title={r.code ?? undefined}>
                      <span className="line-clamp-3 break-all">{r.code ?? "—"}</span>
                    </td>
                    <td className="min-w-0 px-2 py-2.5 text-zinc-600 dark:text-zinc-400" title={r.clientName ?? undefined}>
                      <span className="line-clamp-3 break-words text-sm">{r.clientName ?? "—"}</span>
                    </td>
                    <td className="min-w-0 px-1 py-2.5" title={lifeLabel}>
                      <Badge variant={lifecycleBadgeVariant(r.lifecycleStatus)}>
                        <span className="line-clamp-2 text-[11px] leading-snug break-words">{lifeLabel}</span>
                      </Badge>
                    </td>
                    <td className="min-w-0 px-1 py-2.5" title={setLabel}>
                      <Badge variant={settlementBadgeVariant(r.settlementStatus)}>
                        <span className="line-clamp-2 text-[11px] leading-snug break-words">{setLabel}</span>
                      </Badge>
                    </td>
                    <td className="px-2 py-2.5 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
                      {r.actualResultNet == null ? "—" : formatMoney(r.actualResultNet)}
                    </td>
                    <td className="min-w-0 px-1 py-2.5">
                      {r.isActive ? (
                        <Badge variant="success">
                          <span className="block max-w-[5.5rem] text-[10px] leading-tight sm:max-w-none sm:text-xs">Aktywny</span>
                        </Badge>
                      ) : (
                        <Badge variant="muted">
                          <span className="block max-w-[5.5rem] text-[10px] leading-tight sm:max-w-none sm:text-xs">Nieaktywny</span>
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 pr-3 text-right">
                      <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-0">
                        <Link
                          href={`/projects/${r.id}`}
                          className="inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Podgląd
                        </Link>
                        <Button variant="ghost" className="!h-auto !py-0.5 !px-1.5 text-xs" onClick={() => openEdit(r)}>
                          Edytuj
                        </Button>
                        <Button
                          variant="ghost"
                          className="!h-auto !py-0.5 !px-1.5 text-xs text-red-600 dark:text-red-400"
                          onClick={() => remove(r.id)}
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
