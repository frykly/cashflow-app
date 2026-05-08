import { TaskCalendarView } from "@/components/calendar/TaskCalendarView";
import { loadCalendarMonthData } from "@/lib/calendar/load-calendar-data";
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

  const { monthLabel, weekRows } = await loadCalendarMonthData(year, month, { assignee, hideDone });

  return (
    <TaskCalendarView
      monthLabel={monthLabel}
      weekRows={weekRows}
      ym={ym}
      year={year}
      month={month}
      assignee={assignee}
      hideDone={hideDone}
    />
  );
}
