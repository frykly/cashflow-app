import { GlobalTasksClient } from "@/components/GlobalTasksClient";
import {
  computeGlobalTaskTabCounts,
  filterGlobalTasks,
  parseGlobalTaskView,
  parseStatusFilter,
  sortTasksForGlobalView,
} from "@/lib/projects/global-task-filters";
import { loadGlobalProjectTasks } from "@/lib/projects/load-global-tasks";

type PageProps = {
  searchParams: Promise<{ view?: string; assignee?: string; status?: string }>;
};

export default async function TasksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const view = parseGlobalTaskView(sp.view);
  const assignee = typeof sp.assignee === "string" ? sp.assignee : "";
  const status = parseStatusFilter(sp.status);

  const all = await loadGlobalProjectTasks();
  const counts = computeGlobalTaskTabCounts(all);
  const filtered = filterGlobalTasks(all, view, { assignee, status });
  const tasks = sortTasksForGlobalView(filtered, view);

  return (
    <GlobalTasksClient
      tasks={tasks}
      view={view}
      tabCounts={counts}
      assignee={assignee}
      status={status}
    />
  );
}
