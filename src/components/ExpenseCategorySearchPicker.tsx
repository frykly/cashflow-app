"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui";
import { formatAccount4Display } from "@/lib/accounting/account-codes";

export type ExpenseCategoryPickerRow = {
  id: string;
  name: string;
  accountingCode?: string | null;
  accountingName?: string | null;
  isActive?: boolean;
};

type Props = {
  categories: ExpenseCategoryPickerRow[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  emptyLabel?: string;
};

function categoryLabel(c: ExpenseCategoryPickerRow): string {
  return formatAccount4Display(c) ?? c.name;
}

function categoryMatches(c: ExpenseCategoryPickerRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [c.accountingCode, c.accountingName, c.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

export function ExpenseCategorySearchPicker({
  categories,
  value,
  onChange,
  disabled,
  placeholder = "Szukaj kodu lub nazwy (429, leasing, paliwo…)",
  emptyLabel = "(brak)",
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => categories.find((c) => c.id === value) ?? null,
    [categories, value],
  );

  const filtered = useMemo(() => {
    const list = categories.filter((c) => categoryMatches(c, q));
    return list.sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "pl"));
  }, [categories, q]);

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
        onClick={() => !disabled && setOpen((o) => !o)}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <span className={`min-w-0 truncate ${selected ? "" : "text-zinc-500"}`}>
          {selected ? categoryLabel(selected) : emptyLabel}
          {selected?.isActive === false ? " (zarchiwizowana)" : ""}
        </span>
        <span className="shrink-0 text-zinc-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && !disabled ? (
        <div className="absolute z-40 mt-1 max-h-72 w-full min-w-[min(100%,20rem)] overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 sm:min-w-[24rem]">
          <div className="sticky top-0 border-b border-zinc-100 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-900">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={placeholder}
              className="!py-1.5 !text-sm"
            />
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
            {emptyLabel}
          </button>
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              onClick={() => {
                onChange(c.id);
                setOpen(false);
                setQ("");
              }}
            >
              {categoryLabel(c)}
              {c.isActive === false ? (
                <span className="ml-1 text-xs text-zinc-500">(zarchiwizowana)</span>
              ) : null}
            </button>
          ))}
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500">Brak wyników — wpisz kod 4xx lub nazwę kategorii.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
