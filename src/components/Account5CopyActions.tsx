"use client";

import { useCallback, useState } from "react";
import {
  formatAccount5BreakdownClipboard,
  formatAccount5CodesList,
  resolveCostInvoiceSingleAccount5,
  type Account5AllocationLike,
  type CostInvoiceAccount5Source,
} from "@/lib/accounting/account5-clipboard";
import { copyTextToClipboard } from "@/lib/payments/transfer-clipboard";

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-3.5" aria-hidden>
      <path d="M4 2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H6z" />
      <path d="M2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-1H6a2 2 0 0 1-2-2V5H2z" />
    </svg>
  );
}

function useCopyFeedback() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copy = useCallback(async (id: string, text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    }
  }, []);

  return { copiedId, copy };
}

export function Account5CopyButton({
  text,
  title = "Kopiuj konto 5",
  feedbackId = "single",
}: {
  text: string;
  title?: string;
  feedbackId?: string;
}) {
  const { copiedId, copy } = useCopyFeedback();
  const copied = copiedId === feedbackId;

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => copy(feedbackId, text, e)}
        title={title}
        aria-label={title}
        className="rounded p-0.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <CopyIcon />
      </button>
      {copied ? <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Skopiowano</span> : null}
    </span>
  );
}

export function Account5SingleCopyLine({
  code,
  hint,
  className,
}: {
  code: string;
  hint?: string | null;
  className?: string;
}) {
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 font-mono text-xs text-zinc-800 dark:text-zinc-200 ${className ?? ""}`}>
      <span title={hint ?? code}>{code}</span>
      <Account5CopyButton text={code} />
    </span>
  );
}

export function Account5MultiCopyActions({
  allocs,
  className,
  compactCodes = true,
}: {
  allocs: Account5AllocationLike[];
  className?: string;
  compactCodes?: boolean;
}) {
  const { copiedId, copy } = useCopyFeedback();
  const breakdown = formatAccount5BreakdownClipboard(allocs);
  const codes = formatAccount5CodesList(allocs);
  const title = allocs
    .map((a) => {
      const code = a.account5Code?.trim() || a.project?.name || "—";
      return code;
    })
    .join("\n");

  return (
    <div className={`space-y-1 ${className ?? ""}`} onClick={(e) => e.stopPropagation()}>
      {compactCodes && codes ? (
        <p className="font-mono text-xs leading-snug text-zinc-800 dark:text-zinc-200" title={title}>
          {codes}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <button
          type="button"
          className="text-[11px] font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          onClick={(e) => copy("breakdown", breakdown, e)}
        >
          Kopiuj rozbicie
        </button>
        {copiedId === "breakdown" ? (
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Skopiowano</span>
        ) : null}
        <button
          type="button"
          className="text-[11px] font-medium text-zinc-700 underline hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          onClick={(e) => copy("codes", codes, e)}
        >
          Kopiuj konta
        </button>
        {copiedId === "codes" ? (
          <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">Skopiowano</span>
        ) : null}
      </div>
    </div>
  );
}

export function CostListAccount5Cell({ row }: { row: CostInvoiceAccount5Source }) {
  const allocs = row.projectAllocations ?? [];

  if (allocs.length > 1) {
    return <Account5MultiCopyActions allocs={allocs} />;
  }

  const code = resolveCostInvoiceSingleAccount5(row);
  if (!code) {
    return <span className="text-zinc-500 dark:text-zinc-400">—</span>;
  }

  const hint =
    allocs.length === 1
      ? [code, allocs[0].project?.name?.trim()].filter(Boolean).join(" · ")
      : row.project?.name?.trim()
        ? `${code} · ${row.project.name.trim()}`
        : code;

  return <Account5SingleCopyLine code={code} hint={hint} />;
}
