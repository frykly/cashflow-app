"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Field, Input, Modal, Spinner } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import {
  fetchContractorsSearchCached,
  invalidateContractorsSearchCache,
  peekContractorsSearchCache,
} from "@/lib/contractors/contractors-search-cache";
import { normalizeContractorName } from "@/lib/contractors/normalize-contractor-name";

type ContractorAlias = {
  id?: string;
  aliasName: string;
  normalizedAlias: string;
  source: string | null;
};

type ContractorSuggestion = {
  id: string;
  displayName: string;
  normalizedName: string;
  taxId: string | null;
  type: string | null;
  aliases: ContractorAlias[];
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
};

function matchingAlias(row: ContractorSuggestion, query: string): ContractorAlias | null {
  const q = query.trim();
  const nq = normalizeContractorName(q);
  if (!q && !nq) return null;
  const displayMatch = row.displayName.toLowerCase().includes(q.toLowerCase()) || row.normalizedName.includes(nq);
  const alias =
    row.aliases.find((a) => a.aliasName.toLowerCase().includes(q.toLowerCase())) ??
    row.aliases.find((a) => a.normalizedAlias.includes(nq));
  return alias && !displayMatch ? alias : null;
}

export function ContractorAutocomplete({ value, onChange, disabled, required, placeholder }: Props) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState(value);
  const [debounced, setDebounced] = useState(value);
  const [rows, setRows] = useState<ContractorSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickDraft, setQuickDraft] = useState({ displayName: "", taxId: "", aliasName: "" });
  const [quickSaving, setQuickSaving] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  useEffect(() => {
    setQuery(value);
    setDebounced(value);
  }, [value]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 220);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!focused && !quickOpen) return;
    let cancelled = false;
    const peeked = peekContractorsSearchCache(debounced);
    if (peeked !== undefined) {
      setRows(peeked as ContractorSuggestion[]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    void fetchContractorsSearchCached(debounced)
      .then((rows) => {
        if (!cancelled) setRows(rows as ContractorSuggestion[]);
      })
      .catch((e) => {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : "Nie udało się pobrać kontrahentów");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, focused, quickOpen]);

  const visibleRows = useMemo(() => rows.slice(0, 8), [rows]);

  function selectContractor(row: ContractorSuggestion) {
    onChange(row.displayName);
    setQuery(row.displayName);
    setFocused(false);
  }

  function openQuickAdd() {
    setQuickDraft({ displayName: query.trim(), taxId: "", aliasName: "" });
    setQuickError(null);
    setQuickOpen(true);
    setFocused(false);
  }

  async function quickAdd() {
    const displayName = quickDraft.displayName.trim();
    if (!displayName) {
      setQuickError("Podaj nazwę kontrahenta.");
      return;
    }
    setQuickSaving(true);
    setQuickError(null);
    try {
      const body = {
        displayName,
        taxId: quickDraft.taxId.trim() || null,
        aliases:
          quickDraft.aliasName.trim() ?
            [{ aliasName: quickDraft.aliasName.trim(), source: "manual" }]
          : [],
      };
      const res = await fetch("/api/contractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setQuickError(readApiErrorBody(j));
        return;
      }
      const created = j as ContractorSuggestion;
      invalidateContractorsSearchCache();
      onChange(created.displayName);
      setQuery(created.displayName);
      setRows((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      setQuickOpen(false);
    } catch {
      setQuickError("Błąd sieci przy dodawaniu kontrahenta.");
    } finally {
      setQuickSaving(false);
    }
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 160)}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
      />

      {focused && !disabled ? (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-950">
          {error ? <p className="px-2 py-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          {loading ? (
            <p className="px-2 py-2 text-xs text-zinc-500">
              <Spinner className="mr-2 inline !size-3" />
              Szukanie kontrahentów…
            </p>
          ) : null}
          {!loading && visibleRows.length === 0 ? (
            <p className="px-2 py-2 text-xs text-zinc-500">Brak sugestii z katalogu. Możesz wpisać nazwę ręcznie.</p>
          ) : null}
          {visibleRows.map((row) => {
            const alias = matchingAlias(row, query);
            return (
              <button
                key={row.id}
                type="button"
                className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-900"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectContractor(row)}
              >
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{row.displayName}</span>
                <span className="ml-2 inline-flex gap-1 align-middle">
                  {row.taxId ? <Badge variant="muted">NIP {row.taxId}</Badge> : null}
                  {row.type ? <Badge variant="muted">{row.type}</Badge> : null}
                </span>
                {alias ? (
                  <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-300">
                    Znaleziono alias: {alias.aliasName} → {row.displayName}
                  </span>
                ) : null}
              </button>
            );
          })}
          <div className="mt-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
            <button
              type="button"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openQuickAdd}
            >
              Dodaj kontrahenta
            </button>
          </div>
        </div>
      ) : null}

      <Modal open={quickOpen} title="Dodaj kontrahenta" onClose={() => setQuickOpen(false)}>
        <div className="space-y-3">
          {quickError ? <Alert variant="error">{quickError}</Alert> : null}
          <Field label="Nazwa główna">
            <Input
              value={quickDraft.displayName}
              onChange={(e) => setQuickDraft({ ...quickDraft, displayName: e.target.value })}
              disabled={quickSaving}
              autoFocus
            />
          </Field>
          <Field label="NIP (opcjonalnie)">
            <Input
              value={quickDraft.taxId}
              onChange={(e) => setQuickDraft({ ...quickDraft, taxId: e.target.value })}
              disabled={quickSaving}
            />
          </Field>
          <Field label="Alias (opcjonalnie)">
            <Input
              value={quickDraft.aliasName}
              onChange={(e) => setQuickDraft({ ...quickDraft, aliasName: e.target.value })}
              disabled={quickSaving}
              placeholder="np. nazwa z banku, PDF lub KSeF"
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <Button type="button" onClick={() => void quickAdd()} disabled={quickSaving}>
              {quickSaving ? <Spinner className="!size-4" /> : null}
              Dodaj i użyj
            </Button>
            <Button type="button" variant="secondary" onClick={() => setQuickOpen(false)} disabled={quickSaving}>
              Anuluj
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
