import type { ProjectTask } from "@prisma/client";

/** Porównanie dnia kalendarzowego (lokalnie) dla sortowania; brak daty = na końcu przy rosnącym. */
function daySortKey(d: Date | null | undefined): number {
  if (!d) return Number.MAX_SAFE_INTEGER;
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return Number.MAX_SAFE_INTEGER;
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Sort: plannedStartDate ↑, plannedEndDate ↑, createdAt ↑; zadania bez obu dat logicznie na końcu. */
export function compareProjectTasksBySchedule(a: ProjectTask, b: ProjectTask): number {
  const s = daySortKey(a.plannedStartDate) - daySortKey(b.plannedStartDate);
  if (s !== 0) return s;
  const e = daySortKey(a.plannedEndDate) - daySortKey(b.plannedEndDate);
  if (e !== 0) return e;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

/** Niewykonane pierwsze, potem jak `compareProjectTasksBySchedule`. */
export function sortProjectTasksForList<T extends ProjectTask>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
    return compareProjectTasksBySchedule(a, b);
  });
}
