"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input, Spinner } from "@/components/ui";
import { formatVehicleLabel } from "@/lib/accounting/vehicle-label";

export type VehiclePickerRow = {
  id: string;
  registrationNumber: string;
  name: string | null;
  make: string | null;
  model: string | null;
  isActive: boolean;
};

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function VehicleSearchPicker({
  value,
  onChange,
  disabled,
  placeholder = "Szukaj po rejestracji / marce…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<VehiclePickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [labelRow, setLabelRow] = useState<VehiclePickerRow | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ picker: "1", q: search, activeOnly: "1" });
      const r = await fetch(`/api/vehicles?${sp}`);
      const j = await r.json();
      setRows(Array.isArray(j) ? j : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!value) {
      setLabelRow(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/vehicles/${value}`);
        const j = await r.json();
        if (!cancelled && r.ok) setLabelRow(j);
      } catch {
        if (!cancelled) setLabelRow(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void load(q), 200);
    return () => window.clearTimeout(t);
  }, [open, q, load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative w-full min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm dark:border-zinc-600 dark:bg-zinc-950"
      >
        <span className="min-w-0 truncate">
          {labelRow ? formatVehicleLabel(labelRow) : value ? "…" : "— wybierz pojazd —"}
        </span>
        <span className="shrink-0 text-zinc-400">▾</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            className="mb-2 w-full"
          />
          <button
            type="button"
            className="mb-1 w-full rounded px-2 py-1.5 text-left text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            (brak pojazdu)
          </button>
          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="flex items-center gap-2 px-2 py-2 text-xs text-zinc-500">
                <Spinner className="!size-3" /> Ładowanie…
              </div>
            ) : rows.length === 0 ? (
              <p className="px-2 py-2 text-xs text-zinc-500">Brak wyników</p>
            ) : (
              rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  onClick={() => {
                    onChange(r.id);
                    setLabelRow(r);
                    setOpen(false);
                  }}
                >
                  {formatVehicleLabel(r)}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
