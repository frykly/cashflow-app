"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input, Spinner } from "@/components/ui";
import { formatProjectPickerLabel } from "@/lib/project-picker-label";

export type ProjectPickerRow = {
  id: string;
  name: string;
  code: string | null;
  clientName: string | null;
  isActive: boolean;
};

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function ProjectSearchPicker({ value, onChange, disabled, placeholder = "Szukaj projektu…" }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProjectPickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [labelRow, setLabelRow] = useState<ProjectPickerRow | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (search: string) => {
      setLoading(true);
      try {
        const sp = new URLSearchParams({ picker: "1", q: search });
        if (value) sp.set("selectedId", value);
        const r = await fetch(`/api/projects?${sp}`);
        const j = await r.json();
        setRows(Array.isArray(j) ? j : []);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [value],
  );

  useEffect(() => {
    if (!value) {
      setLabelRow(null);
      setLabelLoading(false);
      return;
    }
    let cancelled = false;
    setLabelLoading(true);
    (async () => {
      try {
        const sp = new URLSearchParams({ picker: "1", q: "", selectedId: value });
        const r = await fetch(`/api/projects?${sp}`);
        const j = await r.json();
        if (cancelled) return;
        const list = Array.isArray(j) ? j : [];
        setLabelRow(list.find((x: ProjectPickerRow) => x.id === value) ?? null);
      } catch {
        if (!cancelled) setLabelRow(null);
      } finally {
        if (!cancelled) setLabelLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void load(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q, open, load]);

  useEffect(() => {
    if (!open) return;
    void load(q.trim());
  }, [open, load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const selected = rows.find((r) => r.id === value) ?? (value && labelRow?.id === value ? labelRow : null);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <span className={selected ? "truncate" : "truncate text-zinc-500"}>
          {labelLoading && value ? (
            <span className="text-zinc-400">Ładowanie…</span>
          ) : selected ? (
            formatProjectPickerLabel(selected)
          ) : value ? (
            <span className="text-amber-700 dark:text-amber-400">Projekt (id) — otwórz listę</span>
          ) : (
            "(brak projektu)"
          )}
        </span>
        <span className="shrink-0 text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && !disabled ? (
        <div className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <div className="sticky top-0 border-b border-zinc-100 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="!py-1.5 !text-sm"
            />
            {loading ? (
              <div className="mt-2 flex justify-center">
                <Spinner className="!size-4" />
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            onClick={() => {
              onChange(null);
              setOpen(false);
              setQ("");
            }}
          >
            (brak projektu)
          </button>
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              onClick={() => {
                onChange(r.id);
                setOpen(false);
                setQ("");
              }}
            >
              {formatProjectPickerLabel(r)}
            </button>
          ))}
          {!loading && rows.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">Brak wyników (tylko aktywne, dopisz frazę lub wybierz z listy).</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
