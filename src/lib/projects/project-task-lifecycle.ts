/** Spójne zestawianie statusu / isDone / doneAt przy tworzeniu i PATCH (checkbox + formularz). */

export type ProjectTaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export function mergeTaskLifecycle(
  existing: { status: string; isDone: boolean; doneAt: Date | null },
  patch: { status?: ProjectTaskStatus; isDone?: boolean },
): { status: string; isDone: boolean; doneAt: Date | null } {
  if (patch.isDone === true) {
    return { status: "DONE", isDone: true, doneAt: new Date() };
  }
  if (patch.isDone === false) {
    const isDone = false;
    const doneAt: Date | null = null;
    if (patch.status !== undefined && patch.status !== "DONE") {
      return { status: patch.status, isDone, doneAt };
    }
    return { status: "TODO", isDone, doneAt };
  }
  if (patch.status !== undefined) {
    if (patch.status === "DONE") {
      return { status: "DONE", isDone: true, doneAt: existing.doneAt ?? new Date() };
    }
    return { status: patch.status, isDone: false, doneAt: null };
  }
  return {
    status: existing.status,
    isDone: existing.isDone,
    doneAt: existing.doneAt,
  };
}
