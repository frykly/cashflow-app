import { prisma } from "@/lib/db";
import type { GlobalProjectTaskRow } from "@/lib/projects/global-task-filters";
import { sortProjectTasksForList } from "@/lib/projects/project-task-sort";

export async function loadGlobalProjectTasks(): Promise<GlobalProjectTaskRow[]> {
  const raw = await prisma.projectTask.findMany({
    include: {
      project: { select: { id: true, name: true } },
    },
  });
  const sorted = sortProjectTasksForList(raw);
  return sorted.map((t) => ({
    id: t.id,
    projectId: t.projectId,
    projectName: t.project.name,
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
