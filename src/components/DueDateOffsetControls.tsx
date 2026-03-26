"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import { addDaysToYmd } from "@/lib/date-helpers";

const SHORTCUTS = [7, 14, 30, 45] as const;

type Props = {
  baseYmd: string | null | undefined;
  disabled: boolean;
  onApplyDue: (dueYmd: string) => void;
};

export function DueDateOffsetControls({ baseYmd, disabled, onApplyDue }: Props) {
  const [custom, setCustom] = useState("");

  function apply(days: number) {
    const b = String(baseYmd ?? "").trim();
    if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return;
    onApplyDue(addDaysToYmd(b, days));
  }

  function applyCustom() {
    const d = Number.parseInt(custom, 10);
    if (!Number.isFinite(d) || d < 0 || d > 3650) return;
    apply(d);
    setCustom("");
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-500">Termin od daty bazowej:</span>
      {SHORTCUTS.map((n) => (
        <Button
          key={n}
          type="button"
          variant="secondary"
          className="!min-w-0 !px-2 !py-0.5 !text-xs"
          disabled={disabled}
          onClick={() => apply(n)}
        >
          +{n}
        </Button>
      ))}
      <span className="inline-flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={3650}
          placeholder="dni"
          className="w-14 rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs tabular-nums dark:border-zinc-600 dark:bg-zinc-900"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          disabled={disabled}
        />
        <Button type="button" variant="secondary" className="!px-2 !py-0.5 !text-xs" disabled={disabled} onClick={applyCustom}>
          OK
        </Button>
      </span>
    </div>
  );
}
