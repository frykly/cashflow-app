"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  success: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  muted: "bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400",
};

export type ProjectStatusOption = { value: string; label: string };

type Props = {
  menuKey: string;
  openKey: string | null;
  onOpenKeyChange: (key: string | null) => void;
  variant: BadgeVariant;
  displayLabel: string;
  valueSlug: string | null | undefined;
  options: ProjectStatusOption[];
  saving: boolean;
  globalPatchBusy: boolean;
  onPick: (slug: string) => void;
};

export function ProjectStatusBadgeSelect({
  menuKey,
  openKey,
  onOpenKeyChange,
  variant,
  displayLabel,
  valueSlug,
  options,
  saving,
  globalPatchBusy,
  onPick,
}: Props) {
  const open = openKey === menuKey;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 216 });
  const [filter, setFilter] = useState("");

  const recalcPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const width = Math.min(Math.max(r.width, 216), 320);
    let left = r.left;
    if (left + width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - width - pad);
    }
    setMenuPos({
      top: r.bottom + 6,
      left,
      width,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    recalcPos();
  }, [open, recalcPos, displayLabel, variant]);

  useEffect(() => {
    if (!open) {
      setFilter("");
      return;
    }
    const focusT =
      options.length > 9 ? window.setTimeout(() => searchRef.current?.focus(), 0) : undefined;
    function onDocMouseDown(e: MouseEvent) {
      const node = e.target as Node;
      if (triggerRef.current?.contains(node)) return;
      if (panelRef.current?.contains(node)) return;
      onOpenKeyChange(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenKeyChange(null);
    }
    function onScrollOrResize() {
      onOpenKeyChange(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      if (focusT !== undefined) window.clearTimeout(focusT);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, onOpenKeyChange, options.length]);

  const filteredOptions = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, filter]);

  const showSearch = options.length > 9;
  const current = (valueSlug ?? "").trim();
  const variantCls = VARIANT_STYLES[variant];

  function toggle() {
    if (globalPatchBusy || saving) return;
    onOpenKeyChange(open ? null : menuKey);
  }

  function pick(slug: string) {
    onOpenKeyChange(null);
    onPick(slug);
  }

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            className="fixed z-[100] flex max-h-[min(16rem,calc(100vh-6rem))] flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white py-1 shadow-lg shadow-zinc-900/10 dark:border-zinc-700/90 dark:bg-zinc-900 dark:shadow-black/40"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
          >
            {showSearch ? (
              <div className="shrink-0 border-b border-zinc-100 px-2 pb-1.5 pt-1 dark:border-zinc-800">
                <input
                  ref={searchRef}
                  type="search"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Szukaj…"
                  className="w-full rounded-lg border-0 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-900 outline-none ring-1 ring-zinc-200/80 placeholder:text-zinc-400 focus:ring-2 focus:ring-zinc-300 dark:bg-zinc-800/80 dark:text-zinc-100 dark:ring-zinc-600 dark:focus:ring-zinc-500"
                  autoComplete="off"
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-0.5">
              {filteredOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-zinc-500">Brak wyników</p>
              ) : (
                filteredOptions.map((o) => {
                  const selected = current === (o.value ?? "").trim();
                  return (
                    <button
                      key={o.value === "" ? "__empty__" : o.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800/90 ${selected ? "bg-zinc-50 dark:bg-zinc-800/50" : ""}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(o.value)}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center text-emerald-600 dark:text-emerald-400">
                        {selected ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1 leading-snug break-words">{o.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={globalPatchBusy || saving}
        aria-expanded={open}
        aria-haspopup="listbox"
        onMouseDown={(e) => {
          if (globalPatchBusy || saving) return;
          if (e.button !== 0) return;
          e.preventDefault();
          toggle();
        }}
        className={`group inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-full px-2.5 py-0.5 text-left text-[11px] font-medium leading-snug outline-none transition hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-zinc-400/70 disabled:pointer-events-none disabled:opacity-45 dark:focus-visible:ring-zinc-500 ${variantCls}`}
      >
        <span className="line-clamp-2 min-w-0 flex-1 break-words">{displayLabel}</span>
        <span className="shrink-0 text-[9px] opacity-60 transition group-hover:opacity-90" aria-hidden>
          ▼
        </span>
      </button>
      {panel}
    </>
  );
}
