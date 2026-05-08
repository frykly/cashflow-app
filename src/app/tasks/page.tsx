import { GlobalTasksClient } from "@/components/GlobalTasksClient";
import {
  computeGlobalTaskTabCounts,
  filterGlobalTasks,
  parseGlobalTaskSort,
  parseGlobalTaskView,
  sortGlobalTaskList,
} from "@/lib/projects/global-task-filters";
import { loadGlobalProjectTasks } from "@/lib/projects/load-global-tasks";

type PageProps = {
  searchParams: Promise<{ view?: string; assignee?: string; sort?: string }>;
};

export default async function TasksPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const view = parseGlobalTaskView(sp.view);
  const assignee = typeof sp.assignee === "string" ? sp.assignee : "";
  const sort = parseGlobalTaskSort(sp.sort, view);

  const all = await loadGlobalProjectTasks();
  const counts = computeGlobalTaskTabCounts(all);
  const filtered = filterGlobalTasks(all, view, { assignee });
  const tasks = sortGlobalTaskList(filtered, sort);

  return <GlobalTasksClient tasks={tasks} view={view} tabCounts={counts} assignee={assignee} sort={sort} />;
}
