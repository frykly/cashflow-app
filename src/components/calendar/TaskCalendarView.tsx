import Link from "next/link";
import { Badge, Button, Field, Input } from "@/components/ui";
import type { CalendarWeekRow } from "@/lib/calendar/load-calendar-data";
import { addMonths, buildCalendarQuery, formatYm } from "@/lib/calendar/month-grid";
import {
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  priorityBadgeVariant,
  statusBadgeVariant,
} from "@/lib/projects/project-task-ui";

const WEEKDAY_LABELS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nie"];

type Props = {
  monthLabel: string;
  weekRows: CalendarWeekRow[];
  ym: string;
  year: number;
  month: number;
  assignee: string;
  hideDone: boolean;
};

export function TaskCalendarView({ monthLabel, weekRows, ym, year, month, assignee, hideDone }: Props) {
  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);
  const prevYm = formatYm(prev.year, prev.month);
  const nextYm = formatYm(next.year, next.month);
  const now = new Date();
  const thisYm = formatYm(now.getFullYear(), now.getMonth() + 1);

  const filterBase = { assignee, hideDone };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Kalendarz</h1>
          <p className="mt-1 text-sm capitalize text-zinc-600 dark:text-zinc-400">{monthLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/calendar${buildCalendarQuery({ ym: prevYm, ...filterBase })}`}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            ← Poprzedni
          </Link>
          <Link
            href={`/calendar${buildCalendarQuery({ ym: thisYm, ...filterBase })}`}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Dziś
          </Link>
          <Link
            href={`/calendar${buildCalendarQuery({ ym: nextYm, ...filterBase })}`}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Następny →
          </Link>
        </div>
      </div>

      <form
        method="get"
        action="/calendar"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <input type="hidden" name="ym" value={ym} />
        <div className="min-w-[200px] flex-1">
          <Field label="Odpowiedzialny (zawiera)">
            <Input type="search" name="assignee" defaultValue={assignee} placeholder="np. Jan" />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" name="hideDone" value="1" defaultChecked={hideDone} className="size-4 rounded border-zinc-300" />
          Ukryj wykonane
        </label>
        <Button type="submit" variant="secondary" className="shrink-0">
          Zastosuj
        </Button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="grid min-w-[760px] grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-800">
          {WEEKDAY_LABELS.map((w) => (
            <div
              key={w}
              className="bg-zinc-50 px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400"
            >
              {w}
            </div>
          ))}
          {weekRows.flatMap((week) =>
            week.map((cell) => (
              <div
                key={cell.dayKey}
                className={`flex min-h-[132px] flex-col bg-white p-1.5 dark:bg-zinc-950 ${cell.inMonth ? "" : "opacity-[0.42]"}`}
              >
                <div
                  className={`text-xs font-semibold tabular-nums ${cell.inMonth ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-500"}`}
                >
                  {cell.date.getDate()}
                </div>
                <div className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                  {cell.tasks.map((t) => (
                    <Link
                      key={`${cell.dayKey}-${t.id}`}
                      href={`/projects/${t.projectId}`}
                      className="block rounded-md border border-zinc-200/90 bg-zinc-50/90 px-1.5 py-1 text-left shadow-sm transition-colors hover:border-zinc-300 hover:bg-amber-50/90 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
                    >
                      <div className={`text-xs font-medium leading-snug ${t.isDone ? "text-zinc-500 line-through" : "text-zinc-900 dark:text-zinc-100"}`}>
                        {t.title}
                      </div>
                      <div className="mt-0.5 truncate text-[0.65rem] text-zinc-600 dark:text-zinc-400">{t.projectName}</div>
                      {t.assigneeName ? (
                        <div className="mt-0.5 truncate text-[0.65rem] text-zinc-500 dark:text-zinc-500">{t.assigneeName}</div>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-0.5">
                        <Badge variant={statusBadgeVariant(t.status, t.isDone)}>
                          {TASK_STATUS_LABEL[t.status] ?? t.status}
                        </Badge>
                        {t.priority ? (
                          <Badge variant={priorityBadgeVariant(t.priority)}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )),
          )}
        </div>
      </div>
    </div>
  );
}
