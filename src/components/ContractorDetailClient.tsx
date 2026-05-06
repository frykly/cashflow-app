"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Spinner, Textarea } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import type { ContractorDetailsResult } from "@/lib/contractors/getContractorDetails";
import { costInvoiceListEditHref, incomeInvoiceListEditHref } from "@/lib/navigation/invoice-deep-links";

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-700">{children}</p>;
}

export function ContractorDetailClient({ data }: { data: ContractorDetailsResult }) {
  const [notes, setNotes] = useState(data.contractor.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(data.contractor.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const { contractor, related } = data;

  async function saveNotes() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/contractors/${contractor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: readApiErrorBody(j) });
        return;
      }
      setSavedNotes(notes);
      setMsg({ type: "ok", text: "Notatki zapisane." });
    } catch {
      setMsg({ type: "err", text: "Błąd sieci przy zapisie notatek." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/contractors" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
            ← Kontrahenci
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{contractor.displayName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span>NIP: {contractor.taxId || "—"}</span>
            {contractor.type ? <Badge variant="muted">{contractor.type}</Badge> : null}
          </div>
          <p className="mt-2 font-mono text-xs text-zinc-500">{contractor.normalizedName}</p>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Aliasy</h2>
        {contractor.aliases.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">Brak aliasów.</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {contractor.aliases.map((a) => (
              <span key={a.id} title={a.normalizedAlias}>
                <Badge variant="muted">
                  {a.aliasName}
                  {a.source ? ` · ${a.source}` : ""}
                </Badge>
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Notatki</h2>
          <Button type="button" onClick={() => void saveNotes()} disabled={saving || notes === savedNotes}>
            {saving ? <Spinner className="!size-4" /> : null}
            Zapisz notatki
          </Button>
        </div>
        {msg ? <Alert variant={msg.type === "ok" ? "success" : "error"}>{msg.text}</Alert> : null}
        <Textarea className="mt-3" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Powiązane dokumenty</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Dopasowanie heurystyczne po nazwie głównej i aliasach. Nie oznacza trwałego powiązania z kontrahentem.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <RelatedCard title="Faktury przychodowe">
            {related.incomeInvoices.length === 0 ? (
              <EmptyState>Brak dopasowań.</EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {related.incomeInvoices.map((r) => (
                  <li key={r.id} className="py-2">
                    <div className="flex justify-between gap-3">
                      <Link href={incomeInvoiceListEditHref(r.id)} className="font-mono text-xs font-medium text-blue-700 underline dark:text-blue-300">
                        {r.invoiceNumber}
                      </Link>
                      <span className="tabular-nums">{formatMoney(r.grossAmount)}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {r.contractor} · {formatDate(r.issueDate)} · {r.status}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RelatedCard>

          <RelatedCard title="Faktury kosztowe">
            {related.costInvoices.length === 0 ? (
              <EmptyState>Brak dopasowań.</EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {related.costInvoices.map((r) => (
                  <li key={r.id} className="py-2">
                    <div className="flex justify-between gap-3">
                      <Link href={costInvoiceListEditHref(r.id)} className="font-mono text-xs font-medium text-blue-700 underline dark:text-blue-300">
                        {r.documentNumber}
                      </Link>
                      <span className="tabular-nums">{formatMoney(r.grossAmount)}</span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {r.supplier} · {formatDate(r.documentDate)} · {r.status}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RelatedCard>

          <RelatedCard title="Projekty">
            {related.projects.length === 0 ? (
              <EmptyState>Brak dopasowań.</EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {related.projects.map((r) => (
                  <li key={r.id} className="py-2">
                    <Link href={`/projects/${r.id}`} className="font-medium text-blue-700 underline dark:text-blue-300">
                      {r.name}
                    </Link>
                    <div className="mt-1 text-xs text-zinc-500">
                      {r.code ? `${r.code} · ` : ""}
                      {r.clientName || "—"} · {r.isActive ? "aktywny" : "nieaktywny"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RelatedCard>

          <RelatedCard title="Transakcje bankowe">
            {related.bankTransactions.length === 0 ? (
              <EmptyState>Brak dopasowań.</EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {related.bankTransactions.map((r) => (
                  <li key={r.id} className="py-2">
                    <div className="flex justify-between gap-3">
                      <Link href={`/bank-imports/${r.importId}/transactions/${r.id}`} className="font-medium text-blue-700 underline dark:text-blue-300">
                        {formatDate(r.bookingDate)}
                      </Link>
                      <span className="tabular-nums">{formatMoney(Math.abs(r.amount) / 100)}</span>
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-zinc-500">
                      {r.counterpartyName || "—"} · {r.description} · {r.status}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RelatedCard>
        </div>
      </section>
    </div>
  );
}

function RelatedCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">{title}</h3>
      {children}
    </section>
  );
}
