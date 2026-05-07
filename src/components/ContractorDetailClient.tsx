"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Spinner, Textarea } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import type { ContractorDetailsResult } from "@/lib/contractors/getContractorDetails";
import { costInvoiceListEditHref, incomeInvoiceListEditHref } from "@/lib/navigation/invoice-deep-links";
import { bankTransactionStatusLabel } from "@/lib/bank-import/bank-transaction-status-label";
import { NewIncomeInvoiceFormModal } from "@/components/IncomeInvoiceFormModal";

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-300 p-3 text-sm text-zinc-500 dark:border-zinc-700">{children}</p>;
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      {children}
    </Link>
  );
}

function incomeStatusBadge(status: string) {
  if (status === "OPLACONA") return <Badge variant="success">Opłacona</Badge>;
  if (status === "PARTIALLY_RECEIVED") return <Badge variant="warning">Częściowo opłacona</Badge>;
  if (status === "WYSTAWIONA") return <Badge variant="warning">Wystawiona</Badge>;
  return <Badge variant="muted">Planowana</Badge>;
}

function costStatusBadge(status: string) {
  if (status === "ZAPLACONA") return <Badge variant="success">Zapłacona</Badge>;
  if (status === "PARTIALLY_PAID") return <Badge variant="warning">Częściowo zapłacona</Badge>;
  if (status === "DO_ZAPLATY") return <Badge variant="warning">Do zapłaty</Badge>;
  return <Badge variant="muted">Planowana</Badge>;
}

function projectStatusBadge(isActive: boolean) {
  return isActive ? <Badge variant="success">Aktywny</Badge> : <Badge variant="muted">Nieaktywny</Badge>;
}

function bankStatusBadge(status: string) {
  const variant = status === "UNMATCHED" || status === "NEW" ? "warning" : status === "BROKEN_LINK" ? "danger" : "muted";
  return <Badge variant={variant}>{bankTransactionStatusLabel(status)}</Badge>;
}

function SummaryCard({
  title,
  primary,
  rows,
}: {
  title: string;
  primary: string;
  rows: { label: string; value: string }[];
}) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">{primary}</div>
      <div className="mt-3 space-y-1 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <span className="text-zinc-500 dark:text-zinc-400">{row.label}</span>
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{row.value}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-zinc-500">wg dopasowania nazw/aliasów</p>
    </section>
  );
}

export function ContractorDetailClient({ data }: { data: ContractorDetailsResult }) {
  const router = useRouter();
  const [notes, setNotes] = useState(data.contractor.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(data.contractor.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [incomeModalOpen, setIncomeModalOpen] = useState(false);
  const { contractor, related, summary } = data;
  const encodedName = encodeURIComponent(contractor.displayName);

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
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
          <Link href="/contractors" className="text-sm font-medium text-zinc-700 underline dark:text-zinc-300">
            ← Kontrahenci
          </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{contractor.displayName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-900">NIP: {contractor.taxId || "—"}</span>
              {contractor.type ? <Badge variant="muted">{contractor.type}</Badge> : null}
          </div>
            <p className="mt-3 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Dopasowanie dokumentów po nazwie i aliasach. To jeszcze nie jest trwałe powiązanie.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button type="button" variant="secondary" onClick={() => setIncomeModalOpen(true)}>
              + Faktura przychodowa
            </Button>
            <LinkButton href={`/cost-invoices?new=1&clientName=${encodedName}`}>+ Faktura kosztowa</LinkButton>
            <LinkButton href="/projects">+ Projekt</LinkButton>
            <LinkButton href="/contractors">Edytuj kontrahenta</LinkButton>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Podsumowanie</h2>
          <p className="mt-1 text-sm text-zinc-500">Podsumowanie dokumentów znalezionych po nazwach. Listy niżej pokazują ostatnie 50 pozycji.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Należności"
            primary={`${summary.income.count} faktur`}
            rows={[
              { label: "Suma brutto", value: formatMoney(summary.income.grossAmount) },
              { label: "Wpłynęło", value: formatMoney(summary.income.receivedAmount) },
              { label: "Pozostało", value: formatMoney(summary.income.remainingAmount) },
            ]}
          />
          <SummaryCard
            title="Zobowiązania"
            primary={`${summary.costs.count} faktur`}
            rows={[
              { label: "Suma brutto", value: formatMoney(summary.costs.grossAmount) },
              { label: "Zapłacono", value: formatMoney(summary.costs.paidAmount) },
              { label: "Pozostało", value: formatMoney(summary.costs.remainingAmount) },
            ]}
          />
          <SummaryCard
            title="Projekty"
            primary={`${summary.projects.count} projektów`}
            rows={[
              { label: "Aktywne", value: String(summary.projects.activeCount) },
              { label: "Nieaktywne", value: String(summary.projects.count - summary.projects.activeCount) },
            ]}
          />
          <SummaryCard
            title="Bank"
            primary={`${summary.bank.count} transakcji`}
            rows={[
              { label: "Suma wpływów", value: formatMoney(summary.bank.incomeAmount) },
              { label: "Suma wydatków", value: formatMoney(summary.bank.expenseAmount) },
            ]}
          />
        </div>
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
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Dokumenty i aktywność</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ostatnie 50 pozycji w każdej sekcji, wg dopasowania nazw/aliasów.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <RelatedCard title="Faktury przychodowe">
            {related.incomeInvoices.length === 0 ? (
              <EmptyState>Brak dopasowań.</EmptyState>
            ) : (
              <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
                {related.incomeInvoices.map((r) => (
                  <li key={r.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link href={incomeInvoiceListEditHref(r.id)} className="font-medium text-blue-700 underline dark:text-blue-300">
                          Faktura {r.invoiceNumber}
                      </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span>{r.contractor}</span>
                          <span>{formatDate(r.issueDate)}</span>
                          {incomeStatusBadge(r.status)}
                        </div>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{formatMoney(r.grossAmount)}</span>
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
                  <li key={r.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link href={costInvoiceListEditHref(r.id)} className="font-medium text-blue-700 underline dark:text-blue-300">
                          Faktura {r.documentNumber}
                      </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span>{r.supplier}</span>
                          <span>{formatDate(r.documentDate)}</span>
                          {costStatusBadge(r.status)}
                        </div>
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">{formatMoney(r.grossAmount)}</span>
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
                  <li key={r.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link href={`/projects/${r.id}`} className="font-medium text-blue-700 underline dark:text-blue-300">
                          Projekt {r.name}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          {r.code ? <span>{r.code}</span> : null}
                          <span>{r.clientName || "—"}</span>
                          {projectStatusBadge(r.isActive)}
                        </div>
                      </div>
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
                  <li key={r.id} className="py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                      <Link href={`/bank-imports/${r.importId}/transactions/${r.id}`} className="font-medium text-blue-700 underline dark:text-blue-300">
                          Transakcja bankowa — {formatDate(r.bookingDate)}
                      </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span>{r.counterpartyName || "—"}</span>
                          {bankStatusBadge(r.status)}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs text-zinc-500">{r.description}</div>
                      </div>
                      <span className={`shrink-0 font-medium tabular-nums ${r.amount < 0 ? "text-red-700 dark:text-red-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                        {formatMoney(r.amount / 100)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </RelatedCard>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Aliasy i dopasowanie</h2>
        <p className="mt-1 text-sm text-zinc-500">Te nazwy są używane do heurystycznego wyszukiwania dokumentów.</p>
        {contractor.aliases.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Brak aliasów.</p>
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

      <NewIncomeInvoiceFormModal
        open={incomeModalOpen}
        contractorName={contractor.displayName}
        onClose={() => setIncomeModalOpen(false)}
        onSaved={() => {
          setIncomeModalOpen(false);
          router.refresh();
        }}
      />
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
