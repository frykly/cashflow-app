import { TaskCalendarView } from "@/components/calendar/TaskCalendarView";
import { loadCalendarMonthData, type CalendarWeekBlockJSON } from "@/lib/calendar/load-calendar-data";
import { formatYm, parseYm } from "@/lib/calendar/month-grid";

type PageProps = {
  searchParams: Promise<{ ym?: string; assignee?: string; hideDone?: string }>;
};

export default async function CalendarPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { year, month } = parseYm(typeof sp.ym === "string" ? sp.ym : undefined);
  const assignee = typeof sp.assignee === "string" ? sp.assignee : "";
  const hideDone = sp.hideDone === "1";
  const ym = formatYm(year, month);

  const { monthLabel, weeks, tiles } = await loadCalendarMonthData(year, month, { assignee, hideDone });

  const weeksJson: CalendarWeekBlockJSON[] = weeks.map((w) => ({
    days: w.days.map((d) => ({
      dayKey: d.dayKey,
      inMonth: d.inMonth,
      dateIso: d.date.toISOString(),
    })),
  }));

  return (
    <TaskCalendarView
      monthLabel={monthLabel}
      weeks={weeksJson}
      tiles={tiles}
      ym={ym}
      year={year}
      month={month}
      assignee={assignee}
      hideDone={hideDone}
    />
  );
}
