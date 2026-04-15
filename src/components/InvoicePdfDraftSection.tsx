"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import type { InvoicePdfDraftResponse } from "@/lib/invoice-pdf/types";

type Props = {
  kind: "cost" | "income";
  disabled?: boolean;
  onDraft: (draft: InvoicePdfDraftResponse) => void;
};

export function InvoicePdfDraftSection({ kind, disabled, onDraft }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setLoading(true);
    setLocalErr(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("kind", kind);
      const res = await fetch("/api/invoice-pdf-draft", { method: "POST", body: fd });
      const data: unknown = await res.json();
      if (!res.ok) {
        setLocalErr(readApiErrorBody(data));
        return;
      }
      onDraft(data as InvoicePdfDraftResponse);
    } catch {
      setLocalErr("Nie udało się wysłać pliku.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-amber-400/80 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/25">
      <input ref={inputRef} type="file" accept="application/pdf" className="sr-only" onChange={onFile} />
      <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
        <strong className="font-medium text-zinc-800 dark:text-zinc-200">Szkic z PDF</strong> — pola zostaną uzupełnione
        podglądowo. Faktura <strong>nie</strong> zapisze się sama; sprawdź kwoty i dane przed kliknięciem Zapisz.
      </p>
      <Button type="button" variant="secondary" disabled={disabled || loading} onClick={() => inputRef.current?.click()}>
        {loading ? "Wczytywanie…" : "Wczytaj z PDF"}
      </Button>
      {localErr ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">{localErr}</p> : null}
    </div>
  );
}
