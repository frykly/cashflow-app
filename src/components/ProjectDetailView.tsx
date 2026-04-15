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
import {
  costInvoiceNewFromProjectQuery,
  incomeInvoiceNewFromProjectQuery,
  plannedEventNewFromProjectQuery,
} from "@/lib/project-quick-links";

function moneyFromDecimal(v: Decimal | null | undefined): string {
  if (v == null) return "—";
  return formatMoney(decToNumber(v));
}

/** W widoku projektu: przy alokacji pokazuj netto przypisane do tego projektu; inaczej całość dokumentu (legacy). */
function incomeNetSliceForProject(
  r: ProjectDetailsResult["incomeInvoices"][number],
): number {
  const slices = r.projectAllocations;
  if (slices && slices.length > 0) return decToNumber(slices[0]!.netAmount as Decimal);
  return decToNumber(r.netAmount);
}

function costNetSliceForProject(r: ProjectDetailsResult["costInvoices"][number]): number {
  const slices = r.projectAllocations;
  if (slices && slices.length > 0) return decToNumber(slices[0]!.netAmount as Decimal);
  return decToNumber(r.netAmount);
}

function plannedAmountSliceForProject(r: ProjectDetailsResult["plannedEvents"][number]): {
  amount: number;
  amountVat: number;
} {
  const slices = r.projectAllocations;
  if (slices && slices.length > 0) {
    return {
      amount: decToNumber(slices[0]!.amount as Decimal),
      amountVat: decToNumber(slices[0]!.amountVat as Decimal),
    };
  }
  return {
    amount: decToNumber(r.amount),
    amountVat: decToNumber(r.amountVat ?? 0),
  };
}

function plannedStatusLabel(s: string): string {
  if (s === "CONVERTED") return "Skonwertowane";
  if (s === "PLANNED") return "Zaplanowane";
  if (s === "DONE") return "Zrealizowane";
  if (s === "CANCELLED") return "Anulowane";
  return s;
}

export function ProjectDetailView({ data }: { data: ProjectDetailsResult }) {
  const { project, counts, real, forecast, progress, incomeInvoices, costInvoices, plannedEvents } = data;

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
            {project.code ? (
              <span>
                <span className="text-zinc-500">Numer zlecenia:</span>{" "}
                <span className="font-mono">{project.code}</span>
              </span>
            ) : null}
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
          href={`/projects?edit=${project.id}`}
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
            href={`/income-invoices?${incomeInvoiceNewFromProjectQuery(project)}`}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            + Faktura przychodowa
          </Link>
          <Link
            href={`/cost-invoices?${costInvoiceNewFromProjectQuery(project)}`}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            + Faktura kosztowa
          </Link>
          <Link
            href={`/planned-events?${plannedEventNewFromProjectQuery(project)}`}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            + Zdarzenie planowane
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Wynik rzeczywisty (faktury)</h2>
        <p className="mb-3 text-xs text-zinc-500">Tylko zafakturowane przychody i koszty — bez zdarzeń planowanych.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Liczba faktur przychodowych</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.income}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Liczba faktur kosztowych</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.cost}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Zdarzenia planowane (łącznie)</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{counts.planned}</p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
            <p className="text-xs text-emerald-800 dark:text-emerald-300">Przychody netto (faktury)</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
              {formatMoney(real.incomeNet)}
            </p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
            <p className="text-xs text-red-800 dark:text-red-300">Koszty netto (faktury)</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-red-800 dark:text-red-300">
              {formatMoney(real.costNet)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Wynik netto rzeczywisty</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(real.netResult)}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Plan / forecast projektu</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Łączny plan (pole projektu + aktywne zdarzenia „Zaplanowane”) vs faktury. Forecast netto = (plan przychodu − faktyczny przychód) − (plan kosztu − faktyczny koszt) — pokazuje, ile zostało do
          „domknięcia” względem planu przy już zaksięgowanych kwotach.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Plan przychodu (pole projektu)</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(forecast.manualPlannedRevenueNet)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Plan kosztu (pole projektu)</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(forecast.manualPlannedCostNet)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Plan z zdarzeń (wpływy netto)</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
              +{formatMoney(forecast.plannedEventsIncomeNet)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Plan z zdarzeń (wydatki netto)</p>
            <p className="mt-1 text-sm font-semibold tabular-nums text-red-800 dark:text-red-300">
              {formatMoney(forecast.plannedEventsExpenseNet)}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/30">
            <p className="text-xs text-indigo-900 dark:text-indigo-200">Łączny plan przychodu</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-indigo-900 dark:text-indigo-100">
              {formatMoney(forecast.totalPlannedRevenue)}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/30">
            <p className="text-xs text-indigo-900 dark:text-indigo-200">Łączny plan kosztu</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-indigo-900 dark:text-indigo-100">
              {formatMoney(forecast.totalPlannedCost)}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/40 sm:col-span-2 lg:col-span-3">
            <p className="text-xs text-indigo-900 dark:text-indigo-200">Forecast netto (pozostało vs plan)</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-indigo-950 dark:text-indigo-50">
              {formatMoney(forecast.forecastNet)}
            </p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Plan vs rzeczywistość</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Odchylenia faktur netto od łącznego planu. Ostatnia kolumna: wynik rzeczywisty minus początkowy bilans planowany (bez uwzględnienia odchyleń częściowych w forecast powyżej).
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Przychód: fakty − plan</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(progress.revenueActualVsPlanned)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Koszt: fakty − plan</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(progress.costActualVsPlanned)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Wynik − początkowy plan bilansu</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(progress.netActualVsForecast)}</p>
          </div>
        </div>
      </section>

      <p className="text-xs text-zinc-500">
        Tabele poniżej: do 250 ostatnich pozycji w każdej kategorii. Liczniki i sumy liczone są po całości danych. Przy
        fakturze lub zdarzeniu rozbitnym na kilka projektów w kolumnach kwot widać{" "}
        <span className="font-medium">udział przypisany do tego projektu</span>, nie pełną kwotę dokumentu.
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
                    <td className="px-3 py-2 tabular-nums">{formatMoney(incomeNetSliceForProject(r))}</td>
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
                    <td className="px-3 py-2 tabular-nums">{formatMoney(costNetSliceForProject(r))}</td>
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
                <th className="px-3 py-2 font-medium">Powiązanie</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {plannedEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                    Brak powiązań
                  </td>
                </tr>
              ) : (
                plannedEvents.map((r) => {
                  const slice = plannedAmountSliceForProject(r);
                  return (
                  <tr key={r.id} className="bg-white dark:bg-zinc-950">
                    <td className="max-w-[200px] truncate px-3 py-2 font-medium">{r.title}</td>
                    <td className="px-3 py-2 text-xs">{r.type}</td>
                    <td className="px-3 py-2 tabular-nums text-xs">
                      {formatMoney(slice.amount)}
                      {slice.amountVat > 0 ? (
                        <span className="block text-zinc-500">+ VAT {formatMoney(slice.amountVat)}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.plannedDate)}</td>
                    <td className="px-3 py-2 text-xs">{plannedStatusLabel(r.status)}</td>
                    <td className="max-w-[140px] px-3 py-2 text-xs">
                      {r.convertedToIncomeInvoice ? (
                        <Link
                          href={`/income-invoices?editIncome=${r.convertedToIncomeInvoice.id}`}
                          className="font-medium text-emerald-800 underline dark:text-emerald-300"
                        >
                          FV {r.convertedToIncomeInvoice.invoiceNumber}
                        </Link>
                      ) : r.convertedToCostInvoice ? (
                        <Link
                          href={`/cost-invoices?editCost=${r.convertedToCostInvoice.id}`}
                          className="font-medium text-red-800 underline dark:text-red-300"
                        >
                          {r.convertedToCostInvoice.documentNumber}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/planned-events?editPlanned=${r.id}`}
                        className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                      >
                        Otwórz
                      </Link>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
