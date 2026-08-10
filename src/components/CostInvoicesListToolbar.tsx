"use client";

import { useMemo, useState } from "react";
import { ProjectSearchPicker } from "@/components/ProjectSearchPicker";
import { COST_PLACE_KINDS, costPlaceKindLabel } from "@/lib/accounting/account-codes";
import { formatVehicleLabel } from "@/lib/accounting/vehicle-label";
import {
  costListAdvancedFilterCount,
  costListAdvancedFilterCountFromDraft,
  type SavedCostListView,
} from "@/lib/cost-invoices-list-storage";
import { Button, Field, Input, Select } from "@/components/ui";

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

const QUICK_PRESETS = [
  { id: "all" as const, label: "Wszystkie" },
  { id: "uncategorized" as const, label: "Bez kategorii" },
  { id: "overdue" as const, label: "Po terminie" },
];

const STATUS_LABELS: Record<string, string> = {
  PLANOWANA: "Planowana",
  DO_ZAPLATY: "Do zapłaty",
  PARTIALLY_PAID: "Częściowo",
  ZAPLACONA: "Zapłacona",
};

type Cat = { id: string; name: string; isActive?: boolean };
type ProjectOption = { id: string; name: string; isActive?: boolean };
type VehicleOption = {
  id: string;
  registrationNumber: string;
  name?: string | null;
  make?: string | null;
  model?: string | null;
};

export type CostFilterDraft = {
  q: string;
  status: string;
  categoryIds: string[];
  uncategorizedOnly: boolean;
  recurringSource: string;
  projectId: string;
  vehicleId: string;
  costPlaceKind: string;
  paymentSource: string;
  account4: string;
  dateFrom: string;
  dateTo: string;
  dateField: string;
  overdueOnly: boolean;
};

type FilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

type Props = {
  filterDraft: CostFilterDraft;
  setFilterDraft: React.Dispatch<React.SetStateAction<CostFilterDraft>>;
  merged: URLSearchParams;
  queryString: string;
  listLoading: boolean;
  projects: ProjectOption[];
  categories: Cat[];
  vehicles: VehicleOption[];
  sort: string;
  order: "asc" | "desc";
  onSortChange: (v: string) => void;
  onOrderChange: (v: "asc" | "desc") => void;
  onApply: () => void;
  onClear: () => void;
  onClearChip: (updates: Record<string, string | null>) => void;
  onQuickPreset: (id: "all" | "uncategorized" | "overdue") => void;
  quickAllActive: boolean;
  savedViews: SavedCostListView[];
  onLoadView: (v: SavedCostListView) => void;
  onSaveView: () => void;
  onDeleteView: (id: string) => void;
  onImportFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importMsg: string | null;
};

function buildFilterChips(
  m: URLSearchParams,
  projects: ProjectOption[],
  categories: Cat[],
  vehicles: VehicleOption[],
  onClearChip: (updates: Record<string, string | null>) => void,
): FilterChip[] {
  const chips: FilterChip[] = [];

  const q = m.get("q")?.trim();
  if (q) chips.push({ id: "q", label: q, onRemove: () => onClearChip({ q: null }) });

  const status = m.get("status")?.trim();
  if (status) {
    chips.push({
      id: "status",
      label: STATUS_LABELS[status] ?? status,
      onRemove: () => onClearChip({ status: null }),
    });
  }

  const projectId = m.get("projectId")?.trim();
  if (projectId) {
    const p = projects.find((x) => x.id === projectId);
    chips.push({
      id: "projectId",
      label: p?.name ?? "Projekt",
      onRemove: () => onClearChip({ projectId: null }),
    });
  }

  const account4 = m.get("account4")?.trim();
  if (account4) {
    chips.push({
      id: "account4",
      label: `Konto 4: ${account4}`,
      onRemove: () => onClearChip({ account4: null }),
    });
  }

  const costPlaceKind = m.get("costPlaceKind")?.trim();
  if (costPlaceKind) {
    chips.push({
      id: "costPlaceKind",
      label: costPlaceKindLabel(costPlaceKind),
      onRemove: () => onClearChip({ costPlaceKind: null }),
    });
  }

  const vehicleId = m.get("vehicleId")?.trim();
  if (vehicleId) {
    const v = vehicles.find((x) => x.id === vehicleId);
    chips.push({
      id: "vehicleId",
      label: `Pojazd: ${v ? formatVehicleLabel(v) : vehicleId}`,
      onRemove: () => onClearChip({ vehicleId: null }),
    });
  }

  const paymentSource = m.get("paymentSource")?.trim();
  if (paymentSource) {
    chips.push({
      id: "paymentSource",
      label: `Płatność: ${paymentSource}`,
      onRemove: () => onClearChip({ paymentSource: null }),
    });
  }

  const recurringSource = m.get("recurringSource")?.trim();
  if (recurringSource) {
    chips.push({
      id: "recurringSource",
      label: recurringSource === "generated" ? "Z cyklicznych" : "Ręczne",
      onRemove: () => onClearChip({ recurringSource: null }),
    });
  }

  if (m.get("uncategorized") === "1") {
    chips.push({
      id: "uncategorized",
      label: "Bez kategorii",
      onRemove: () => onClearChip({ uncategorized: null }),
    });
  }

  const catsRaw = m.get("categories")?.trim() || m.get("categoryId")?.trim();
  if (catsRaw) {
    for (const id of catsRaw.split(",").map((x) => x.trim()).filter(Boolean)) {
      const c = categories.find((x) => x.id === id);
      chips.push({
        id: `cat-${id}`,
        label: c?.name ?? "Kategoria",
        onRemove: () => {
          const ids = catsRaw
            .split(",")
            .map((x) => x.trim())
            .filter((x) => x && x !== id);
          onClearChip({
            categories: ids.length ? ids.join(",") : null,
            categoryId: null,
          });
        },
      });
    }
  }

  const dateFrom = m.get("dateFrom")?.trim();
  const dateTo = m.get("dateTo")?.trim();
  if (dateFrom || dateTo) {
    chips.push({
      id: "dates",
      label: `Daty: ${dateFrom || "…"} – ${dateTo || "…"}`,
      onRemove: () => onClearChip({ dateFrom: null, dateTo: null, dateField: null }),
    });
  }

  if (m.get("overdue") === "1") {
    chips.push({
      id: "overdue",
      label: "Po terminie",
      onRemove: () => onClearChip({ overdue: null }),
    });
  }

  return chips;
}

export function CostInvoicesListToolbar({
  filterDraft,
  setFilterDraft,
  merged,
  queryString,
  listLoading,
  projects,
  categories,
  vehicles,
  sort,
  order,
  onSortChange,
  onOrderChange,
  onApply,
  onClear,
  onClearChip,
  onQuickPreset,
  quickAllActive,
  savedViews,
  onLoadView,
  onSaveView,
  onDeleteView,
  onImportFile,
  importMsg,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);

  const advancedCount = moreOpen
    ? costListAdvancedFilterCountFromDraft(filterDraft)
    : costListAdvancedFilterCount(merged);
  const chips = useMemo(
    () => buildFilterChips(merged, projects, categories, vehicles, onClearChip),
    [merged, projects, categories, vehicles, onClearChip],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-[10rem] flex-1 basis-[12rem]">
          <label className="mb-0.5 block text-[11px] font-medium text-zinc-500">Szukaj</label>
          <Input
            className="!py-1.5 !text-sm"
            value={filterDraft.q}
            onChange={(e) => setFilterDraft((d) => ({ ...d, q: e.target.value }))}
            placeholder="nr, dostawca, konto…"
            disabled={listLoading}
            onKeyDown={(e) => e.key === "Enter" && onApply()}
          />
        </div>
        <div className="w-[9.5rem]">
          <label className="mb-0.5 block text-[11px] font-medium text-zinc-500">Status</label>
          <Select
            className="!py-1.5 !text-sm"
            value={filterDraft.status}
            onChange={(e) => setFilterDraft((d) => ({ ...d, status: e.target.value }))}
            disabled={listLoading}
          >
            <option value="">(wszystkie)</option>
            <option value="PLANOWANA">Planowana</option>
            <option value="DO_ZAPLATY">Do zapłaty</option>
            <option value="PARTIALLY_PAID">Częściowo</option>
            <option value="ZAPLACONA">Zapłacona</option>
          </Select>
        </div>
        <div className="min-w-[10rem] flex-1 basis-[11rem]">
          <label className="mb-0.5 block text-[11px] font-medium text-zinc-500">Projekt</label>
          <ProjectSearchPicker
            value={filterDraft.projectId || null}
            onChange={(id) => setFilterDraft((d) => ({ ...d, projectId: id ?? "" }))}
            disabled={listLoading}
            placeholder="Szukaj projektu…"
          />
        </div>
        <div className="w-[9rem]">
          <label className="mb-0.5 block text-[11px] font-medium text-zinc-500">Konto 4</label>
          <Input
            className="!py-1.5 !text-sm"
            value={filterDraft.account4}
            onChange={(e) => setFilterDraft((d) => ({ ...d, account4: e.target.value }))}
            placeholder="429, leasing…"
            disabled={listLoading}
            onKeyDown={(e) => e.key === "Enter" && onApply()}
          />
        </div>
        <div className="flex flex-wrap items-end gap-1.5 pb-0.5">
          <Button
            type="button"
            variant="secondary"
            className="!py-1.5 !text-xs"
            onClick={() => setMoreOpen((v) => !v)}
            disabled={listLoading}
          >
            Więcej filtrów{advancedCount > 0 ? ` (${advancedCount})` : ""}
          </Button>
          <Button type="button" variant="secondary" className="!py-1.5 !text-xs" onClick={onClear} disabled={listLoading}>
            Wyczyść
          </Button>
          <Button type="button" className="!py-1.5 !text-xs" onClick={onApply} disabled={listLoading}>
            Zastosuj
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-end gap-1.5 pb-0.5">
          <Select
            value={sort}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sortuj"
            disabled={listLoading}
            className="min-w-[8.5rem] !py-1.5 !text-xs"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <Select
            value={order}
            onChange={(e) => onOrderChange(e.target.value as "asc" | "desc")}
            aria-label="Kolejność"
            disabled={listLoading}
            className="w-[7rem] !py-1.5 !text-xs"
          >
            <option value="asc">Rosnąco</option>
            <option value="desc">Malejąco</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK_PRESETS.map((p) => {
          const active =
            p.id === "all" ? quickAllActive
            : p.id === "uncategorized" ? merged.get("uncategorized") === "1"
            : merged.get("overdue") === "1";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onQuickPreset(p.id)}
              disabled={listLoading}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                active
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-300"
              }`}
            >
              {p.label}
            </button>
          );
        })}
        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            className="!py-1 !text-xs"
            onClick={() => setViewsOpen((v) => !v)}
            disabled={listLoading}
          >
            Widoki{savedViews.length ? ` (${savedViews.length})` : ""}
          </Button>
          {viewsOpen ? (
            <div className="absolute left-0 z-30 mt-1 min-w-[14rem] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              {savedViews.length === 0 ? (
                <p className="px-3 py-2 text-xs text-zinc-500">Brak zapisanych widoków</p>
              ) : (
                savedViews.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 px-2 py-1 hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <button
                      type="button"
                      className="flex-1 truncate text-left text-sm"
                      onClick={() => {
                        onLoadView(v);
                        setViewsOpen(false);
                      }}
                    >
                      {v.name}
                    </button>
                    <button type="button" className="text-xs text-red-600" onClick={() => onDeleteView(v.id)} title="Usuń">
                      ×
                    </button>
                  </div>
                ))
              )}
              <div className="border-t border-zinc-100 px-2 py-1 dark:border-zinc-800">
                <button
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  onClick={() => {
                    onSaveView();
                    setViewsOpen(false);
                  }}
                >
                  Zapisz bieżący widok…
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <span className="text-xs text-zinc-500">
          <a className="underline" href={`/api/cost-invoices/export?format=csv&${queryString}`}>
            CSV
          </a>
          {" · "}
          <a className="underline" href={`/api/cost-invoices/export?format=xlsx&${queryString}`}>
            Excel
          </a>
          {" · "}
          <label className="cursor-pointer underline">
            Import
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onImportFile} />
          </label>
        </span>
        {importMsg ? <span className="text-xs text-zinc-500">{importMsg}</span> : null}
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={c.onRemove}
              disabled={listLoading}
              className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <span className="max-w-[14rem] truncate">{c.label}</span>
              <span aria-hidden>×</span>
            </button>
          ))}
        </div>
      ) : null}

      {moreOpen ? (
        <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <Field label="Miejsce kosztu (konto 5)">
            <Select
              value={filterDraft.costPlaceKind}
              onChange={(e) => setFilterDraft((d) => ({ ...d, costPlaceKind: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">(wszystkie)</option>
              {COST_PLACE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {costPlaceKindLabel(k)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pojazd">
            <Select
              value={filterDraft.vehicleId}
              onChange={(e) => setFilterDraft((d) => ({ ...d, vehicleId: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">(wszystkie)</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {formatVehicleLabel(v)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Źródło płatności">
            <Select
              value={filterDraft.paymentSource}
              onChange={(e) => setFilterDraft((d) => ({ ...d, paymentSource: e.target.value }))}
              disabled={listLoading}
            >
              <option value="">(wszystkie)</option>
              <option value="MAIN">MAIN</option>
              <option value="VAT">VAT</option>
              <option value="VAT_THEN_MAIN">VAT → MAIN</option>
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
          <Field label="Pole daty">
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
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Kategorie</span>
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
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
            <div className="max-h-28 overflow-y-auto rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-600 dark:bg-zinc-950">
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
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 self-end text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={filterDraft.overdueOnly}
              onChange={(e) => setFilterDraft((d) => ({ ...d, overdueOnly: e.target.checked }))}
              disabled={listLoading}
            />
            Tylko po terminie
          </label>
        </div>
      ) : null}
    </div>
  );
}
