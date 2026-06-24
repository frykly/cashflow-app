"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Spinner, Textarea } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import { formatDate, formatMoney } from "@/lib/format";
import type { ContractorDetailsResult } from "@/lib/contractors/getContractorDetails";
import { bankTransactionStatusLabel } from "@/lib/bank-import/bank-transaction-status-label";
import { NewIncomeInvoiceFormModal } from "@/components/IncomeInvoiceFormModal";
import { ContractorCostPaymentBatch } from "@/components/ContractorCostPaymentBatch";
import {
  lifecycleBadgeVariant,
  settlementBadgeVariant,
} from "@/lib/project-status-labels";

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

function projectStatusBadge(isActive: boolean) {
  return isActive ? <Badge variant="success">Aktywny</Badge> : <Badge variant="muted">Nieaktywny</Badge>;
}

function bankStatusBadge(status: string) {
  const variant = status === "UNMATCHED" || status === "NEW" ? "warning" : status === "BROKEN_LINK" ? "danger" : "muted";
  return <Badge variant={variant}>{bankTransactionStatusLabel(status)}</Badge>;
}

function ActivityEmpty() {
  return <p className="text-xs text-zinc-500 dark:text-zinc-500">Brak dopasowań.</p>;
}

function ActivitySectionTitle({ title, tone = "default" }: { title: string; tone?: "default" | "muted" }) {
  if (tone === "muted") {
    return (
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">{title}</h3>
    );
  }
  return <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>;
}

const cardInteractive =
  "group w-full rounded-2xl px-4 py-3 text-left transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50 dark:focus-visible:ring-zinc-500 dark:focus-visible:ring-offset-zinc-950";

const cardInvoice = `${cardInteractive} bg-zinc-50/80 hover:bg-zinc-100/90 dark:bg-zinc-900/50 dark:hover:bg-zinc-800/65`;

const cardProject = `${cardInteractive} bg-zinc-100/70 hover:bg-zinc-100 dark:bg-zinc-900/55 dark:hover:bg-zinc-800/75`;

const cardBank = `${cardInteractive} rounded-xl px-3 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50/90 dark:text-zinc-400 dark:bg-zinc-950/30 dark:hover:bg-zinc-900/45`;

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
  const [incomeModalInvoiceId, setIncomeModalInvoiceId] = useState<string | null>(null);
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

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Projekty jako wykonawca</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Trwałe powiązania wykonawcze dodane z poziomu projektu. To nie jest dopasowanie po nazwie klienta.
        </p>
        {related.contractorProjects.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">Brak przypisanych projektów.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Projekt</th>
                  <th className="px-3 py-2 font-medium">Statusy</th>
                  <th className="px-3 py-2 font-medium">Rola / zakres</th>
                  <th className="px-3 py-2 font-medium">Notatka</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {related.contractorProjects.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 align-top">
                      <Link
                        href={`/projects/${r.project.id}`}
                        className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:text-zinc-100 dark:decoration-zinc-600"
                      >
                        {r.project.name}
                      </Link>
                      <p className="mt-1 text-xs text-zinc-500">
                        {[r.project.code, r.project.clientName].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {projectStatusBadge(r.project.isActive)}
                        <Badge variant={lifecycleBadgeVariant(r.project.lifecycleStatus)}>{r.project.lifecycleDisplay}</Badge>
                        <Badge variant={settlementBadgeVariant(r.project.settlementStatus)}>{r.project.settlementDisplay}</Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-300">{r.role?.trim() ? r.role : "—"}</td>
                    <td className="px-3 py-2 align-top text-zinc-600 dark:text-zinc-400">
                      <span className="whitespace-pre-wrap">{r.notes?.trim() ? r.notes : "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Dokumenty i aktywność</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Ostatnie 50 pozycji w każdej sekcji, wg dopasowania nazw/aliasów.
          </p>
        </div>

        <div className="space-y-10">
          <div className="space-y-3">
            <ActivitySectionTitle title="Projekty" />
            {related.projects.length === 0 ? (
              <ActivityEmpty />
            ) : (
              <div className="flex flex-col gap-2.5">
                {related.projects.map((r) => (
                  <Link key={r.id} href={`/projects/${r.id}`} className={cardProject}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-zinc-950 dark:text-zinc-50">{r.name}</span>
                          {projectStatusBadge(r.isActive)}
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {[r.code, r.clientName || null].filter(Boolean).join(" · ") || "—"}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                          <Badge variant={lifecycleBadgeVariant(r.lifecycleStatus)}>{r.lifecycleDisplay}</Badge>
                          <Badge variant={settlementBadgeVariant(r.settlementStatus)}>{r.settlementDisplay}</Badge>
                          {r.missingItems.map((m) => (
                            <Badge key={m.id} variant="warning">
                              Brak: {m.missingType.name}
                            </Badge>
                          ))}
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                          Ostatnia aktywność · {formatDate(r.updatedAt)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
            <div className="space-y-3">
              <ActivitySectionTitle title="Faktury przychodowe" />
              {related.incomeInvoices.length === 0 ? (
                <ActivityEmpty />
              ) : (
                <div className="flex flex-col gap-2">
                  {related.incomeInvoices.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setIncomeModalInvoiceId(r.id);
                        setIncomeModalOpen(true);
                      }}
                      className={cardInvoice}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-50">{r.invoiceNumber}</span>
                            {incomeStatusBadge(r.status)}
                          </div>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            <span className="line-clamp-1">{r.contractor}</span>
                            <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
                            <span>{formatDate(r.issueDate)}</span>
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                          {formatMoney(r.grossAmount)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <ActivitySectionTitle title="Faktury kosztowe" />
              <ContractorCostPaymentBatch
                contractorName={contractor.displayName}
                invoices={related.costInvoices}
              />
            </div>
          </div>

          <div className="space-y-3 pt-1">
            <ActivitySectionTitle title="Transakcje bankowe" tone="muted" />
            {related.bankTransactions.length === 0 ? (
              <ActivityEmpty />
            ) : (
              <div className="flex flex-col gap-1.5 opacity-[0.92]">
                {related.bankTransactions.map((r) => (
                  <Link
                    key={r.id}
                    href={`/bank-imports/${r.importId}/transactions/${r.id}`}
                    className={cardBank}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {formatDate(r.bookingDate)}
                          </span>
                          {bankStatusBadge(r.status)}
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-500">
                          {r.counterpartyName || "—"}
                          {r.description ? ` · ${r.description}` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-xs font-semibold tabular-nums ${
                          r.amount < 0 ? "text-red-600/90 dark:text-red-400/90" : "text-emerald-600/90 dark:text-emerald-400/90"
                        }`}
                      >
                        {formatMoney(r.amount / 100)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
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
        invoiceId={incomeModalInvoiceId}
        onClose={() => {
          setIncomeModalOpen(false);
          setIncomeModalInvoiceId(null);
        }}
        onSaved={() => {
          setIncomeModalOpen(false);
          setIncomeModalInvoiceId(null);
          router.refresh();
        }}
      />
    </div>
  );
}
