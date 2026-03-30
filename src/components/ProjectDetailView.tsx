import Link from "next/link";
import { Badge } from "@/components/ui";
import type { ProjectDetailsResult } from "@/lib/projects/getProjectDetails";
import { formatDate, formatMoney } from "@/lib/format";
import { decToNumber } from "@/lib/cashflow/money";
import type { Decimal } from "@prisma/client/runtime/library";
import {
  lifecycleBadgeVariant,
  projectLifecycleLabel,
  projectSettlementLabel,
  settlementBadgeVariant,
} from "@/lib/project-status-labels";

function moneyFromDecimal(v: Decimal | null | undefined): string {
  if (v == null) return "—";
  return formatMoney(decToNumber(v));
}

export function ProjectDetailView({ data }: { data: ProjectDetailsResult }) {
  const { project, counts, sums, incomeInvoices, costInvoices, plannedEvents } = data;
  const pid = project.id;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/projects" className="font-medium text-zinc-700 underline dark:text-zinc-300">
              ← Projekty
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{project.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            {project.code ? <span className="font-mono">{project.code}</span> : null}
            {project.clientName ? <span>· {project.clientName}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {project.isActive ? <Badge variant="success">Aktywny</Badge> : <Badge variant="muted">Nieaktywny</Badge>}
            <Badge variant={lifecycleBadgeVariant(project.lifecycleStatus)}>
              Realizacja: {projectLifecycleLabel(project.lifecycleStatus)}
            </Badge>
            <Badge variant={settlementBadgeVariant(project.settlementStatus)}>
              Rozliczenie: {projectSettlementLabel(project.settlementStatus)}
            </Badge>
          </div>
        </div>
        <Link
          href={`/projects?edit=${pid}`}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Edytuj
        </Link>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Plan i opis</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-zinc-500">Planowany przychód netto</dt>
            <dd className="text-sm font-medium tabular-nums">{moneyFromDecimal(project.plannedRevenueNet)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500">Planowany koszt netto</dt>
            <dd className="text-sm font-medium tabular-nums">{moneyFromDecimal(project.plannedCostNet)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500">Data rozpoczęcia</dt>
            <dd className="text-sm">{project.startDate ? formatDate(project.startDate) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-zinc-500">Data zakończenia</dt>
            <dd className="text-sm">{project.endDate ? formatDate(project.endDate) : "—"}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500">Opis</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
            {project.description?.trim() ? project.description : "—"}
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Szybkie akcje</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/income-invoices?new=1&projectId=${pid}`}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            + Faktura przychodowa
          </Link>
          <Link
            href={`/cost-invoices?new=1&projectId=${pid}`}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            + Faktura kosztowa
          </Link>
          <Link
            href={`/planned-events?new=1&projectId=${pid}`}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            + Zdarzenie planowane
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Podsumowanie (z dokumentów)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Faktury przychodowe</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.income}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Faktury kosztowe</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.cost}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Zdarzenia planowane</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.planned}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Suma przychodów netto</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
              {formatMoney(sums.incomeNet)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Suma kosztów netto</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-red-800 dark:text-red-300">
              {formatMoney(sums.costNet)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Wynik netto</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(sums.netResult)}</p>
          </div>
        </div>
      </section>

      <p className="text-xs text-zinc-500">
        Tabele poniżej: do 250 ostatnich pozycji w każdej kategorii. Liczniki i sumy liczone są po całości danych.
      </p>

      <section id="income">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Faktury przychodowe</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Numer</th>
                <th className="px-3 py-2 font-medium">Kontrahent</th>
                <th className="px-3 py-2 font-medium">Netto</th>
                <th className="px-3 py-2 font-medium">Plan. wpływ</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {incomeInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    Brak powiązań
                  </td>
                </tr>
              ) : (
                incomeInvoices.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 font-mono text-xs">{r.invoiceNumber}</td>
                    <td className="max-w-[180px] truncate px-3 py-2">{r.contractor}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(decToNumber(r.netAmount))}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.plannedIncomeDate)}</td>
                    <td className="px-3 py-2 text-xs">{r.status}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/income-invoices?editIncome=${r.id}`}
                        className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                      >
                        Otwórz
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="cost">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Faktury kosztowe</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Numer</th>
                <th className="px-3 py-2 font-medium">Dostawca</th>
                <th className="px-3 py-2 font-medium">Netto</th>
                <th className="px-3 py-2 font-medium">Plan. zapłata</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {costInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    Brak powiązań
                  </td>
                </tr>
              ) : (
                costInvoices.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 font-mono text-xs">{r.documentNumber}</td>
                    <td className="max-w-[180px] truncate px-3 py-2">{r.supplier}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(decToNumber(r.netAmount))}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.plannedPaymentDate)}</td>
                    <td className="px-3 py-2 text-xs">{r.status}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/cost-invoices?editCost=${r.id}`}
                        className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                      >
                        Otwórz
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="planned">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Zdarzenia planowane</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Tytuł</th>
                <th className="px-3 py-2 font-medium">Typ</th>
                <th className="px-3 py-2 font-medium">Kwota</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {plannedEvents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                    Brak powiązań
                  </td>
                </tr>
              ) : (
                plannedEvents.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-zinc-950">
                    <td className="max-w-[200px] truncate px-3 py-2 font-medium">{r.title}</td>
                    <td className="px-3 py-2 text-xs">{r.type}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(decToNumber(r.amount))}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.plannedDate)}</td>
                    <td className="px-3 py-2 text-xs">{r.status}</td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/planned-events?editPlanned=${r.id}`}
                        className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                      >
                        Otwórz
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
