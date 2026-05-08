"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ProjectTaskFormModal } from "@/components/ProjectTaskFormModal";
import { Alert, Badge, Button } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import {
  TASK_STATUS_LABEL,
  PRIORITY_LABEL,
  statusBadgeVariant,
  priorityBadgeVariant,
  scheduleLabel,
  isTaskOverdue,
  isTaskToday,
  sortActiveTasks,
  sortDoneTasks,
  type ProjectTaskRow,
} from "@/lib/projects/project-task-ui";

export type { ProjectTaskRow };

export function ProjectTasksSection({ projectId, initialTasks }: { projectId: string; initialTasks: ProjectTaskRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectTaskRow | null>(null);

  const { activeTasks, doneTasks, todoCount, overdueCount, doneCount } = useMemo(() => {
    const active = initialTasks.filter((t) => !t.isDone);
    const done = initialTasks.filter((t) => t.isDone);
    const overdue = active.filter((t) => isTaskOverdue(t)).length;
    const sortedActive = [...active].sort(sortActiveTasks);
    const sortedDone = [...done].sort(sortDoneTasks);
    return {
      activeTasks: sortedActive,
      doneTasks: sortedDone,
      todoCount: active.length,
      overdueCount: overdue,
      doneCount: done.length,
    };
  }, [initialTasks]);

  function openNew() {
    setEditing(null);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(t: ProjectTaskRow) {
    setEditing(t);
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function refresh() {
    router.refresh();
  }

  async function toggleDone(t: ProjectTaskRow, done: boolean) {
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDone: done }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(readApiErrorBody(j));
        return;
      }
      await refresh();
    } catch {
      setError("Błąd sieci");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteTask(t: ProjectTaskRow) {
    if (!confirm(`Usunąć zadanie „${t.title}”?`)) return;
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${t.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json();
        setError(readApiErrorBody(j));
        return;
      }
      await refresh();
    } catch {
      setError("Błąd sieci");
    } finally {
      setBusyId(null);
    }
  }

  function renderTaskRow(t: ProjectTaskRow, tone: "active" | "done") {
    const busy = busyId === t.id;
    const overdue = tone === "active" && isTaskOverdue(t);
    const today = tone === "active" && isTaskToday(t);
    const hasSchedule = !!(t.plannedStartDate || t.plannedEndDate);

    const accentClass =
      tone === "done"
        ? "border-zinc-100/80 bg-zinc-50/30 dark:border-zinc-800/80 dark:bg-zinc-900/20"
        : overdue
          ? "border-red-200 bg-red-50/70 dark:border-red-900/50 dark:bg-red-950/25"
          : today
            ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/45 dark:bg-amber-950/20"
            : "border-zinc-100 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-900/30";

    return (
      <li
        key={t.id}
        className={`rounded-lg border px-2 py-2.5 transition-colors sm:px-3 ${accentClass}`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 gap-2.5">
            <input
              type="checkbox"
              className="mt-[0.35rem] size-4 shrink-0 rounded border-zinc-300"
              checked={t.isDone}
              disabled={busy}
              onChange={(e) => void toggleDone(t, e.target.checked)}
              aria-label={t.isDone ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 gap-y-1">
                <span
                  className={`min-w-0 font-medium leading-snug break-words ${t.isDone ? "text-zinc-500 line-through" : "text-zinc-900 dark:text-zinc-100"}`}
                >
                  {t.title}
                </span>
                <Badge variant={statusBadgeVariant(t.status, t.isDone)}>
                  {TASK_STATUS_LABEL[t.status] ?? t.status}
                </Badge>
                {tone === "active" && overdue ? (
                  <Badge variant="danger">Zaległe</Badge>
                ) : null}
                {tone === "active" && today ? (
                  <Badge variant="warning">Dzisiaj</Badge>
                ) : null}
                {t.priority ? (
                  <Badge variant={priorityBadgeVariant(t.priority)}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
                ) : null}
              </div>
              {t.description ? (
                <p className={`mt-1 text-sm whitespace-pre-wrap ${tone === "done" ? "text-zinc-500 dark:text-zinc-500" : "text-zinc-600 dark:text-zinc-400"}`}>
                  {t.description}
                </p>
              ) : null}
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                <span
                  className={
                    !hasSchedule
                      ? "text-zinc-400 dark:text-zinc-500"
                      : overdue
                        ? "font-medium text-red-700 dark:text-red-300"
                        : today
                          ? "font-medium text-amber-800 dark:text-amber-200"
                          : undefined
                  }
                >
                  {hasSchedule ? (
                    <span className="tabular-nums text-zinc-800 dark:text-zinc-200">{scheduleLabel(t)}</span>
                  ) : (
                    scheduleLabel(t)
                  )}
                </span>
                {t.assigneeName ? (
                  <span>
                    <span className="text-zinc-400">Odpowiedzialny:</span>{" "}
                    <span className="text-zinc-800 dark:text-zinc-200">{t.assigneeName}</span>
                  </span>
                ) : null}
                {t.doneAt ? (
                  <span>
                    Wykonano:{" "}
                    <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{formatDate(t.doneAt)}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1 sm:justify-end">
            <Button type="button" variant="ghost" className="!px-2 !py-1 !text-xs" disabled={busy} onClick={() => openEdit(t)}>
              Edytuj
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="!px-2 !py-1 !text-xs text-red-600 dark:text-red-400"
              disabled={busy}
              onClick={() => void deleteTask(t)}
            >
              Usuń
            </Button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Zadania</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Operacyjna lista prac przy projekcie — bez wpływu na cashflow.</p>
          {initialTasks.length > 0 ? (
            <p className="mt-2 text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{todoCount}</span> do zrobienia
              <span className="text-zinc-400"> · </span>
              <span className={overdueCount > 0 ? "font-medium text-red-600 dark:text-red-400" : ""}>{overdueCount}</span>{" "}
              zaległe
              <span className="text-zinc-400"> · </span>
              <span className="font-medium text-zinc-900 dark:text-zinc-100">{doneCount}</span> wykonane
            </p>
          ) : null}
        </div>
        <Button type="button" onClick={openNew} disabled={busyId !== null}>
          Dodaj zadanie
        </Button>
      </div>

      {error ? (
        <div className="mt-3">
          <Alert variant="error">{error}</Alert>
        </div>
      ) : null}

      {initialTasks.length === 0 ? (
        <p className="mt-6 py-6 text-center text-sm text-zinc-500">Brak zadań. Dodaj pierwsze zadanie projektu.</p>
      ) : (
        <>
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Aktywne
            </h3>
            {activeTasks.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
                Wszystkie zadania wykonane.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">{activeTasks.map((t) => renderTaskRow(t, "active"))}</ul>
            )}
          </div>

          {doneTasks.length > 0 ? (
            <div className="mt-6 opacity-[0.72] transition-opacity hover:opacity-100">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Wykonane
              </h3>
              <ul className="flex flex-col gap-2">{doneTasks.map((t) => renderTaskRow(t, "done"))}</ul>
            </div>
          ) : null}
        </>
      )}

      <ProjectTaskFormModal
        open={modalOpen}
        projectId={projectId}
        task={editing}
        onClose={closeModal}
        onSaved={() => {
          void refresh();
        }}
        showOpenProjectLink={false}
      />
    </section>
  );
}
