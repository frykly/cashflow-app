"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ProjectTaskFormModal } from "@/components/ProjectTaskFormModal";
import { Badge, Button, Field, Input } from "@/components/ui";
import { layoutWeek, tileSpanMs } from "@/lib/calendar/calendar-week-layout";
import {
  calendarTileToProjectTaskRow,
  type CalendarDayHeader,
  type CalendarTaskTile,
  type CalendarWeekBlockJSON,
} from "@/lib/calendar/load-calendar-data";
import { addMonths, buildCalendarQuery, dayKeyFromDate, formatYm } from "@/lib/calendar/month-grid";
import { formatDate } from "@/lib/format";
import {
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  statusBadgeVariant,
} from "@/lib/projects/project-task-ui";

const WEEKDAY_LABELS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nie"];

type Props = {
  monthLabel: string;
  weeks: CalendarWeekBlockJSON[];
  tiles: CalendarTaskTile[];
  ym: string;
  year: number;
  month: number;
  assignee: string;
  hideDone: boolean;
};

function weekJsonToDayHeaders(weeks: CalendarWeekBlockJSON[]): CalendarDayHeader[][] {
  return weeks.map((w) =>
    w.days.map((d) => ({
      dayKey: d.dayKey,
      inMonth: d.inMonth,
      date: new Date(d.dateIso),
    })),
  );
}

function taskBarClasses(t: CalendarTaskTile): string {
  const high = t.priority === "HIGH" ? "ring-1 ring-red-500/70 dark:ring-red-500/50" : "";
  const done = t.isDone || t.status === "DONE";
  if (done) {
    return `relative z-[1] flex min-h-[22px] items-center gap-1 rounded-full border px-2 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-90 ${high} border-emerald-200/90 bg-emerald-100/70 text-emerald-950 opacity-80 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-100`;
  }
  if (t.status === "IN_PROGRESS") {
    return `relative z-[1] flex min-h-[22px] items-center gap-1 rounded-full border px-2 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-90 ${high} border-amber-300/90 bg-amber-100/85 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-50`;
  }
  return `relative z-[1] flex min-h-[22px] items-center gap-1 rounded-full border px-2 py-0.5 text-left text-[11px] leading-tight transition-opacity hover:opacity-90 ${high} border-sky-200/90 bg-sky-100/80 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-100`;
}

function singleCardClasses(t: CalendarTaskTile): string {
  const high = t.priority === "HIGH" ? "ring-1 ring-red-500/60" : "";
  const done = t.isDone || t.status === "DONE";
  if (done) {
    return `block w-full rounded-lg border px-1.5 py-1 text-left transition-colors hover:opacity-90 ${high} border-emerald-200/80 bg-emerald-50/90 opacity-85 dark:border-emerald-900/50 dark:bg-emerald-950/30`;
  }
  if (t.status === "IN_PROGRESS") {
    return `block w-full rounded-lg border px-1.5 py-1 text-left transition-colors hover:opacity-90 ${high} border-amber-200/80 bg-amber-50/90 dark:border-amber-900/45 dark:bg-amber-950/25`;
  }
  return `block w-full rounded-lg border px-1.5 py-1 text-left transition-colors hover:opacity-90 ${high} border-sky-200/80 bg-sky-50/90 dark:border-sky-900/45 dark:bg-sky-950/25`;
}

function buildTaskTitleAttr(t: CalendarTaskTile): string {
  const parts: string[] = [t.title, `Projekt: ${t.projectName}`];
  const span = tileSpanMs(t);
  if (span) {
    const a = formatDate(new Date(span.startMs));
    const b = formatDate(new Date(span.endMs));
    parts.push(a === b ? `Data: ${a}` : `Zakres: ${a} – ${b}`);
  }
  parts.push(`Status: ${TASK_STATUS_LABEL[t.status] ?? t.status}`);
  if (t.assigneeName) parts.push(`Odpowiedzialny: ${t.assigneeName}`);
  if (t.priority) parts.push(`Priorytet: ${PRIORITY_LABEL[t.priority] ?? t.priority}`);
  return parts.join(" · ");
}

export function TaskCalendarView({ monthLabel, weeks, tiles, ym, year, month, assignee, hideDone }: Props) {
  const router = useRouter();
  const [editTile, setEditTile] = useState<CalendarTaskTile | null>(null);
  const weekDayBlocks = useMemo(() => weekJsonToDayHeaders(weeks), [weeks]);

  const prev = addMonths(year, month, -1);
  const next = addMonths(year, month, 1);
  const prevYm = formatYm(prev.year, prev.month);
  const nextYm = formatYm(next.year, next.month);
  const now = new Date();
  const thisYm = formatYm(now.getFullYear(), now.getMonth() + 1);
  const todayKey = dayKeyFromDate(now);

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

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/30">
        <span className="font-medium text-zinc-600 dark:text-zinc-400">Legenda:</span>
        <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
          <span className="h-2.5 w-6 rounded-full border border-sky-300/80 bg-sky-200/90 dark:border-sky-800 dark:bg-sky-900/70" />
          Do zrobienia
        </span>
        <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
          <span className="h-2.5 w-6 rounded-full border border-amber-300/80 bg-amber-200/90 dark:border-amber-800 dark:bg-amber-900/60" />
          W trakcie
        </span>
        <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
          <span className="h-2.5 w-6 rounded-full border border-emerald-300/80 bg-emerald-200/80 opacity-80 dark:border-emerald-800 dark:bg-emerald-900/50" />
          Wykonane
        </span>
        <span className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
          <span className="h-2.5 w-6 rounded-full border border-sky-300 bg-sky-100 ring-1 ring-red-500/80 dark:border-sky-800 dark:bg-sky-950/50" />
          Pilne
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200/70 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-zinc-200/70 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40">
            {WEEKDAY_LABELS.map((w) => (
              <div
                key={w}
                className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-500"
              >
                {w}
              </div>
            ))}
          </div>

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
            {weekDayBlocks.map((week, wkIndex) => {
              const layout = layoutWeek(week, tiles);
              const maxTrack = layout.multiSegments.reduce((m, s) => Math.max(m, s.track), -1);
              const barRowCount = maxTrack + 1;
              const showBarLane = layout.multiSegments.length > 0 || layout.overflowMulti.length > 0;

              return (
                <div key={wkIndex} className="bg-white dark:bg-zinc-950">
                  <div className="grid grid-cols-7 border-b border-zinc-100/90 dark:border-zinc-800/60">
                    {week.map((d) => (
                      <div
                        key={d.dayKey}
                        className={[
                          "py-1.5 text-center text-xs font-semibold tabular-nums",
                          d.inMonth ? "text-zinc-800 dark:text-zinc-100" : "text-zinc-400 opacity-[0.42]",
                          todayKey === d.dayKey ? "bg-sky-50/90 dark:bg-sky-950/45" : "",
                        ].join(" ")}
                      >
                        {d.date.getDate()}
                      </div>
                    ))}
                  </div>

                  {showBarLane ? (
                    <div className="border-b border-zinc-100/90 bg-gradient-to-b from-zinc-50/90 to-white py-1 dark:border-zinc-800/60 dark:from-zinc-900/35 dark:to-zinc-950">
                      <div
                        className="grid gap-y-1 px-0.5"
                        style={{
                          gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                          gridAutoRows: "24px",
                          minHeight: barRowCount > 0 ? `${Math.max(1, barRowCount) * 28}px` : "8px",
                        }}
                      >
                        {layout.multiSegments.map((seg) => (
                          <button
                            key={`${wkIndex}-${seg.task.id}-${seg.startCol}-${seg.endCol}-${seg.track}`}
                            type="button"
                            title={buildTaskTitleAttr(seg.task)}
                            onClick={() => setEditTile(seg.task)}
                            className={[
                              taskBarClasses(seg.task),
                              seg.task.isDone ? "line-through decoration-zinc-500/80" : "",
                              "cursor-pointer text-left",
                            ].join(" ")}
                            style={{
                              gridColumn: `${seg.startCol + 1} / ${seg.endCol + 2}`,
                              gridRow: seg.track + 1,
                            }}
                          >
                            <span className={`min-w-0 flex-1 truncate font-medium ${seg.task.isDone ? "text-zinc-500" : ""}`}>
                              {seg.task.title}
                            </span>
                            {seg.task.priority === "HIGH" ? (
                              <span className="shrink-0 rounded px-1 text-[9px] font-bold uppercase tracking-wide text-red-700 dark:text-red-300">
                                Pilne
                              </span>
                            ) : null}
                            {seg.task.assigneeName ? (
                              <span
                                className={`hidden max-w-[40%] shrink-0 truncate text-[10px] md:inline ${seg.task.isDone ? "text-zinc-500" : "text-zinc-600 dark:text-zinc-400"}`}
                              >
                                {seg.task.assigneeName}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                      {layout.overflowMulti.length > 0 ? (
                        <details className="group mt-1 border-t border-zinc-100/80 px-2 py-1 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                          <summary className="cursor-pointer select-none font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300">
                            +{layout.overflowMulti.length} więcej (paski)
                          </summary>
                          <ul className="mt-1.5 space-y-1 pb-1">
                            {layout.overflowMulti.map((t) => (
                              <li key={t.id}>
                                <button
                                  type="button"
                                  onClick={() => setEditTile(t)}
                                  className="font-medium text-sky-800 underline dark:text-sky-300"
                                >
                                  {t.title}
                                </button>
                                <span className="text-zinc-500"> · {t.projectName}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-7">
                    {week.map((d) => {
                      const pack = layout.singleByDay.get(d.dayKey)!;
                      const more = pack.rest.length;
                      return (
                        <div
                          key={d.dayKey}
                          className={[
                            "min-h-[88px] border-l border-zinc-100/80 p-1 first:border-l-0 dark:border-zinc-800/50",
                            todayKey === d.dayKey ? "bg-sky-50/40 dark:bg-sky-950/20" : "",
                            d.inMonth ? "" : "bg-zinc-50/30 opacity-[0.42] dark:bg-zinc-900/20",
                          ].join(" ")}
                        >
                          <div className="flex flex-col gap-1">
                            {pack.visible.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                title={buildTaskTitleAttr(t)}
                                onClick={() => setEditTile(t)}
                                className={singleCardClasses(t)}
                              >
                                <div className={`text-left text-[11px] font-medium leading-snug ${t.isDone ? "text-zinc-500 line-through" : "text-zinc-900 dark:text-zinc-100"}`}>
                                  {t.title}
                                </div>
                                {t.priority === "HIGH" ? (
                                  <div className="mt-0.5 text-left text-[9px] font-bold uppercase text-red-700 dark:text-red-300">Pilne</div>
                                ) : null}
                                {t.assigneeName ? (
                                  <div className="mt-0.5 truncate text-left text-[10px] text-zinc-500 dark:text-zinc-500">{t.assigneeName}</div>
                                ) : null}
                                <div className="mt-1 flex flex-wrap gap-0.5">
                                  <Badge variant={statusBadgeVariant(t.status, t.isDone)}>
                                    {TASK_STATUS_LABEL[t.status] ?? t.status}
                                  </Badge>
                                </div>
                              </button>
                            ))}
                            {more > 0 ? (
                              <details className="rounded border border-zinc-200/70 bg-zinc-50/80 text-[10px] dark:border-zinc-800 dark:bg-zinc-900/40">
                                <summary className="cursor-pointer px-1 py-0.5 font-medium text-zinc-600 dark:text-zinc-400">
                                  +{more} więcej
                                </summary>
                                <ul className="space-y-0.5 border-t border-zinc-200/60 px-1 py-1 text-left dark:border-zinc-800">
                                  {pack.rest.map((t) => (
                                    <li key={t.id}>
                                      <button
                                        type="button"
                                        onClick={() => setEditTile(t)}
                                        className="font-medium text-sky-800 underline dark:text-sky-300"
                                      >
                                        {t.title}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {editTile ? (
        <ProjectTaskFormModal
          open={!!editTile}
          projectId={editTile.projectId}
          projectName={editTile.projectName}
          task={calendarTileToProjectTaskRow(editTile)}
          onClose={() => setEditTile(null)}
          onSaved={() => router.refresh()}
          showOpenProjectLink
        />
      ) : null}
    </div>
  );
}
