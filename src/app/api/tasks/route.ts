import { jsonData } from "@/lib/api/json-response";
import {
  filterGlobalTasks,
  parseGlobalTaskSort,
  parseGlobalTaskView,
  sortGlobalTaskList,
} from "@/lib/projects/global-task-filters";
import { loadGlobalProjectTasks } from "@/lib/projects/load-global-tasks";

/** Lista zadań ze wszystkich projektów (filtry jak na /tasks). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const view = parseGlobalTaskView(url.searchParams.get("view") ?? undefined);
  const assignee = url.searchParams.get("assignee") ?? "";
  const sort = parseGlobalTaskSort(url.searchParams.get("sort") ?? undefined, view);

  const all = await loadGlobalProjectTasks();
  const filtered = filterGlobalTasks(all, view, { assignee });
  const tasks = sortGlobalTaskList(filtered, sort);
  return jsonData(tasks);
}
