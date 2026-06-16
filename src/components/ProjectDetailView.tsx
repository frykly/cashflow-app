import Link from "next/link";
import { Badge } from "@/components/ui";
import type { ProjectDetailsResult } from "@/lib/projects/getProjectDetails";
import { formatDate, formatMoney } from "@/lib/format";
import { decToNumber } from "@/lib/cashflow/money";
import type { Decimal } from "@prisma/client/runtime/library";
import {
  lifecycleBadgeVariant,
  settlementBadgeVariant,
} from "@/lib/project-status-labels";
import {
  costInvoiceNewFromProjectQuery,
  plannedEventNewFromProjectQuery,
} from "@/lib/project-quick-links";
import { ContractorNameLink } from "@/components/ContractorNameLink";
import { ProjectIncomeInvoiceModalButton } from "@/components/ProjectIncomeInvoiceModalButton";
import { ProjectTasksSection } from "@/components/ProjectTasksSection";
import type { ProjectTaskRow } from "@/lib/projects/project-task-ui";

function moneyFromDecimal(v: Decimal | null | undefined): string {
  if (v == null) return "—";
  return formatMoney(decToNumber(v));
}

function plannedStatusLabel(s: string): string {
  if (s === "CONVERTED") return "Skonwertowane";
  if (s === "PLANNED") return "Zaplanowane";
  if (s === "DONE") return "Zrealizowane";
  if (s === "CANCELLED") return "Anulowane";
  return s;
}

function serializeProjectTasks(tasks: ProjectDetailsResult["tasks"]): ProjectTaskRow[] {
  return tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    plannedStartDate: t.plannedStartDate ? t.plannedStartDate.toISOString() : null,
    plannedEndDate: t.plannedEndDate ? t.plannedEndDate.toISOString() : null,
    assigneeName: t.assigneeName,
    status: t.status,
    isDone: t.isDone,
    doneAt: t.doneAt ? t.doneAt.toISOString() : null,
    priority: t.priority,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));
}

export function ProjectDetailView({ data }: { data: ProjectDetailsResult }) {
  const { project, statusDisplay, missingItems, tasks, counts, balance, incomeInvoices, costInvoices, plannedEvents } =
    data;
  const activePlannedEvents = plannedEvents.filter((r) => r.status !== "CONVERTED");
  const convertedPlannedEvents = plannedEvents.filter((r) => r.status === "CONVERTED");

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
            {project.clientName ? (
              <span>
                · <ContractorNameLink name={project.clientName} />
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {project.isActive ? <Badge variant="success">Aktywny</Badge> : <Badge variant="muted">Nieaktywny</Badge>}
            <Badge variant={lifecycleBadgeVariant(project.lifecycleStatus)}>Realizacja: {statusDisplay.lifecycle}</Badge>
            <Badge variant={settlementBadgeVariant(project.settlementStatus)}>
              Rozliczenie: {statusDisplay.settlement}
            </Badge>
            {missingItems.map((mi) => (
              <Badge key={mi.id} variant="warning">
                Brak: {mi.missingType.name}
              </Badge>
            ))}
          </div>
        </div>
        <Link
          href={`/projects?edit=${project.id}`}
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Edytuj
        </Link>
      </div>

      <ProjectTasksSection projectId={project.id} initialTasks={serializeProjectTasks(tasks)} />

      <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Bilans projektu</h2>
        <p className="mt-1 text-xs text-zinc-500">
          KPI w netto. Przychód „Wpłynęło” = część MAIN z wpłat (respektuje podział MAIN/VAT). Koszty „Zapłacono” =
          netto proporcjonalnie do wpłat. „Planowane bez faktur” = zdarzenia PLANNED jeszcze niezamienione na fakturę.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Powiązane dokumenty: {counts.income} faktur przychodowych · {counts.cost} kosztowych · {counts.planned}{" "}
          zdarzeń planowanych.
        </p>

        <div className="mt-4 space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Przychody</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiTile label="Wpłynęło (MAIN z wpłat)" value={balance.receivedMain} variant="emerald" />
              <KpiTile label="Do wpłaty z faktur (netto)" value={balance.incomeRemainingFromInvoices} variant="white" />
              <KpiTile
                label="Planowane bez faktur (netto)"
                value={balance.plannedIncomeWithoutInvoice}
                variant="white"
              />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Koszty</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiTile label="Zapłacono (netto)" value={balance.costNetPaid} variant="red" />
              <KpiTile label="Do zapłaty z faktur (netto)" value={balance.costRemainingFromInvoices} variant="white" />
              <KpiTile
                label="Planowane bez faktur (netto)"
                value={balance.plannedCostWithoutInvoice}
                variant="white"
              />
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Wynik</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiTile
                label="Wynik realny (wpłynęło − zapłacono)"
                value={balance.resultReal}
                variant="indigo"
              />
              <KpiTile
                label="Wynik oczekiwany (reszty + plany bez FV)"
                value={balance.resultExpected}
                variant="indigo"
              />
              <KpiTile label="Wynik końcowy projektu" value={balance.resultFinal} variant="indigoStrong" />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Plan bazowy projektu</h2>
        <p className="mt-1 text-xs text-zinc-500">Dane wpisane ręcznie przy edycji projektu (nie są nadpisywane przez faktury).</p>
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
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-zinc-500">Planowany wynik bazowy (przychód − koszt planu)</dt>
            <dd className="text-sm font-semibold tabular-nums">{formatMoney(balance.planBaseResult)}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <p className="text-xs font-medium text-zinc-500">Opis</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-200">
            {project.description?.trim() ? project.description : "—"}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Odchylenie od planu bazowego</h2>
        <p className="mt-1 text-xs text-zinc-500">Porównanie wyniku końcowego (Bilans) z planowanym wynikiem bazowym.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Plan bazowy wyniku</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(balance.planBaseResult)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Aktualny wynik końcowy</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(balance.resultFinal)}</p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-xs text-zinc-500">Odchylenie od planu</p>
            <p className="mt-1 text-sm font-semibold tabular-nums">{formatMoney(balance.deviationFromPlan)}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Szybkie akcje</h2>
        <div className="flex flex-wrap gap-2">
          <ProjectIncomeInvoiceModalButton
            contractorName={project.clientName}
            projectId={project.id}
            projectName={project.name}
            projectCode={project.code}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            + Faktura przychodowa
          </ProjectIncomeInvoiceModalButton>
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

      <p className="text-xs text-zinc-500">
        Tabele: do {250} ostatnich pozycji w każdej kategorii. Sumy w bilansie liczone są po wszystkich powiązanych
        dokumentach. Przy dokumencie rozbitnym na wiele projektów widać udział przypisany do tego projektu.
      </p>

      <section id="income">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Faktury przychodowe</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Numer</th>
                <th className="px-3 py-2 font-medium">Kontrahent</th>
                <th className="px-3 py-2 font-medium">Netto</th>
                <th className="px-3 py-2 font-medium">Wpłynęło (MAIN)</th>
                <th className="px-3 py-2 font-medium">Pozostało netto</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {incomeInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                    Brak powiązań
                  </td>
                </tr>
              ) : (
                incomeInvoices.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-zinc-950">
                    <td className="px-3 py-2 font-mono text-xs">{r.invoiceNumber}</td>
                    <td className="max-w-[160px] truncate px-3 py-2">
                      <ContractorNameLink name={r.contractor} />
                    </td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(r.row?.netSlice ?? 0)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(r.row?.mainReceived ?? 0)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(r.row?.netRemaining ?? 0)}</td>
                    <td className="px-3 py-2 text-xs">{r.status}</td>
                    <td className="px-3 py-2 text-right">
                      <ProjectIncomeInvoiceModalButton
                        contractorName={project.clientName}
                        projectId={project.id}
                        projectName={project.name}
                        projectCode={project.code}
                        invoiceId={r.id}
                        className="text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                      >
                        Otwórz
                      </ProjectIncomeInvoiceModalButton>
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
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Numer</th>
                <th className="px-3 py-2 font-medium">Dostawca</th>
                <th className="px-3 py-2 font-medium">Netto</th>
                <th className="px-3 py-2 font-medium">Zapłacono netto</th>
                <th className="px-3 py-2 font-medium">Pozostało netto</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {costInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-zinc-500">
                    Brak powiązań
                  </td>
                </tr>
              ) : (
                costInvoices.map((r) => {
                  const hasVat = !!r.row?.hasVat;
                  return (
                    <tr key={r.id} className="bg-white dark:bg-zinc-950">
                      <td className="px-3 py-2 font-mono text-xs">{r.documentNumber}</td>
                      <td className="max-w-[160px] truncate px-3 py-2">
                        <ContractorNameLink name={r.supplier} />
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <div>{formatMoney(r.row?.netSlice ?? 0)}</div>
                        {hasVat ? (
                          <div className="mt-1 space-y-0.5 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                            <div>VAT: {formatMoney(r.row?.vatSlice ?? 0)}</div>
                            <div>Brutto: {formatMoney(r.row?.grossSlice ?? 0)}</div>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <div>{formatMoney(r.row?.netPaid ?? 0)}</div>
                        {hasVat ? (
                          <div className="mt-1 text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">
                            Zapłacono VAT: {formatMoney(r.row?.vatPaid ?? 0)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        <div>{formatMoney(r.row?.netRemaining ?? 0)}</div>
                        {hasVat ? (
                          <div className="mt-1 text-[11px] font-medium leading-tight text-red-700 dark:text-red-300">
                            VAT do zapłaty: {formatMoney(r.row?.vatRemaining ?? 0)}
                          </div>
                        ) : null}
                      </td>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section id="planned">
        <h2 className="mb-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Zdarzenia planowane</h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2 font-medium">Tytuł</th>
                <th className="px-3 py-2 font-medium">Typ</th>
                <th className="px-3 py-2 font-medium">Kwota netto</th>
                <th className="px-3 py-2 font-medium">VAT</th>
                <th className="px-3 py-2 font-medium">Brutto</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Powiązanie</th>
                <th className="px-3 py-2 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {activePlannedEvents.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-zinc-500">
                    Brak powiązań
                  </td>
                </tr>
              ) : (
                activePlannedEvents.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-zinc-950">
                    <td className="max-w-[200px] truncate px-3 py-2 font-medium">{r.title}</td>
                    <td className="px-3 py-2 text-xs">{r.type}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(r.row?.netAmount ?? 0)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(r.row?.vatAmount ?? 0)}</td>
                    <td className="px-3 py-2 tabular-nums">{formatMoney(r.row?.grossAmount ?? 0)}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {convertedPlannedEvents.length > 0 ? (
        <section id="converted-planned">
          <h2 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Skonwertowane zdarzenia</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-zinc-50 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2 font-medium">Tytuł</th>
                  <th className="px-3 py-2 font-medium">Typ</th>
                  <th className="px-3 py-2 font-medium">Data planu</th>
                  <th className="px-3 py-2 font-medium">Faktura</th>
                  <th className="px-3 py-2 text-right font-medium"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {convertedPlannedEvents.map((r) => (
                  <tr key={r.id} className="bg-white dark:bg-zinc-950">
                    <td className="max-w-[260px] truncate px-3 py-2 font-medium">{r.title}</td>
                    <td className="px-3 py-2 text-xs">{r.type}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(r.plannedDate)}</td>
                    <td className="max-w-[180px] px-3 py-2 text-xs">
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
                        Szczegóły
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function KpiTile({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "emerald" | "red" | "white" | "indigo" | "indigoStrong";
}) {
  const wrap =
    variant === "emerald"
      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
      : variant === "red"
        ? "border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20"
        : variant === "indigo"
          ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/40 dark:bg-indigo-950/30"
          : variant === "indigoStrong"
            ? "border-indigo-300 bg-indigo-100/70 dark:border-indigo-800 dark:bg-indigo-950/50"
            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950";
  return (
    <div className={`rounded-lg border p-4 ${wrap}`}>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatMoney(value)}</p>
    </div>
  );
}
