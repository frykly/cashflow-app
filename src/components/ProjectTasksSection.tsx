"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import { dateInputToIso, isoToDateInputValue } from "@/lib/date-input";
import { formatDate } from "@/lib/format";

const TASK_STATUS_LABEL: Record<string, string> = {
  TODO: "Do zrobienia",
  IN_PROGRESS: "W trakcie",
  DONE: "Wykonane",
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Niski",
  NORMAL: "Normalny",
  HIGH: "Wysoki",
};

export type ProjectTaskRow = {
  id: string;
  title: string;
  description: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  assigneeName: string | null;
  status: string;
  isDone: boolean;
  doneAt: string | null;
  priority: string | null;
  createdAt: string;
  updatedAt: string;
};

function statusBadgeVariant(s: string, isDone: boolean): "default" | "success" | "muted" {
  if (isDone || s === "DONE") return "success";
  if (s === "IN_PROGRESS") return "default";
  return "muted";
}

function priorityBadgeVariant(p: string | null | undefined): "default" | "warning" | "muted" | "danger" {
  if (p === "HIGH") return "danger";
  if (p === "NORMAL") return "default";
  if (p === "LOW") return "muted";
  return "default";
}

function localDayStartMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function plannedDayStartMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return localDayStartMs(d);
}

function todayStartMs(): number {
  return localDayStartMs(new Date());
}

function sameLocalDayIso(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const da = plannedDayStartMs(a);
  const db = plannedDayStartMs(b);
  return da !== null && db !== null && da === db;
}

function scheduleLabel(t: ProjectTaskRow): string {
  const s = t.plannedStartDate;
  const e = t.plannedEndDate;
  if (s && e && sameLocalDayIso(s, e)) return formatDate(s);
  if (s && e) return `${formatDate(s)} → ${formatDate(e)}`;
  if (e) return `Termin: ${formatDate(e)}`;
  if (s) return `Start: ${formatDate(s)}`;
  return "Bez terminu";
}

function dayKeyFromIso(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const p = plannedDayStartMs(iso);
  return p === null ? Number.MAX_SAFE_INTEGER : p;
}

function isTaskOverdue(t: ProjectTaskRow): boolean {
  if (t.isDone || !t.plannedEndDate) return false;
  const p = plannedDayStartMs(t.plannedEndDate);
  if (p === null) return false;
  return p < todayStartMs();
}

function isTaskToday(t: ProjectTaskRow): boolean {
  if (t.isDone) return false;
  const t0 = todayStartMs();
  for (const iso of [t.plannedStartDate, t.plannedEndDate]) {
    if (!iso) continue;
    const p = plannedDayStartMs(iso);
    if (p !== null && p === t0) return true;
  }
  return false;
}

function sortActiveTasks(a: ProjectTaskRow, b: ProjectTaskRow): number {
  const s = dayKeyFromIso(a.plannedStartDate) - dayKeyFromIso(b.plannedStartDate);
  if (s !== 0) return s;
  const e = dayKeyFromIso(a.plannedEndDate) - dayKeyFromIso(b.plannedEndDate);
  if (e !== 0) return e;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}

function sortDoneTasks(a: ProjectTaskRow, b: ProjectTaskRow): number {
  const ta = a.doneAt ? new Date(a.doneAt).getTime() : 0;
  const tb = b.doneAt ? new Date(b.doneAt).getTime() : 0;
  if (tb !== ta) return tb - ta;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function ProjectTasksSection({ projectId, initialTasks }: { projectId: string; initialTasks: ProjectTaskRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectTaskRow | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPlannedStart, setFormPlannedStart] = useState("");
  const [formPlannedEnd, setFormPlannedEnd] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formStatus, setFormStatus] = useState<"TODO" | "IN_PROGRESS" | "DONE">("TODO");
  const [formPriority, setFormPriority] = useState<"" | "LOW" | "NORMAL" | "HIGH">("");
  const [formIsDone, setFormIsDone] = useState(false);
  const [saving, setSaving] = useState(false);

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
    setFormTitle("");
    setFormDescription("");
    setFormPlannedStart("");
    setFormPlannedEnd("");
    setFormAssignee("");
    setFormStatus("TODO");
    setFormPriority("");
    setFormIsDone(false);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(t: ProjectTaskRow) {
    setEditing(t);
    setFormTitle(t.title);
    setFormDescription(t.description ?? "");
    setFormPlannedStart(isoToDateInputValue(t.plannedStartDate));
    setFormPlannedEnd(isoToDateInputValue(t.plannedEndDate));
    setFormAssignee(t.assigneeName ?? "");
    const st = t.status as "TODO" | "IN_PROGRESS" | "DONE";
    setFormStatus(st === "IN_PROGRESS" || st === "DONE" ? st : "TODO");
    setFormPriority(
      t.priority === "LOW" || t.priority === "NORMAL" || t.priority === "HIGH" ? t.priority : "",
    );
    setFormIsDone(t.isDone);
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

  function reconcileStatusForSave(): "TODO" | "IN_PROGRESS" | "DONE" {
    if (formIsDone) return "DONE";
    if (formStatus === "DONE") return "TODO";
    return formStatus;
  }

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    const title = formTitle.trim();
    if (!title) {
      setError("Podaj tytuł zadania.");
      return;
    }
    setSaving(true);
    setError(null);
    const status = reconcileStatusForSave();
    const body = {
      title,
      description: formDescription.trim() || null,
      assigneeName: formAssignee.trim() || null,
      plannedStartDate: dateInputToIso(formPlannedStart),
      plannedEndDate: dateInputToIso(formPlannedEnd),
      status,
      priority: formPriority === "" ? null : formPriority,
      isDone: formIsDone,
    };
    try {
      if (editing) {
        const res = await fetch(`/api/projects/${projectId}/tasks/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await res.json();
        if (!res.ok) {
          setError(readApiErrorBody(j));
          return;
        }
      } else {
        const payload: Record<string, unknown> = {
          title: body.title,
          description: body.description,
          assigneeName: body.assigneeName,
          plannedStartDate: body.plannedStartDate,
          plannedEndDate: body.plannedEndDate,
          status: body.status,
          priority: body.priority,
        };
        if (formIsDone) payload.isDone = true;
        const res = await fetch(`/api/projects/${projectId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json();
        if (!res.ok) {
          setError(readApiErrorBody(j));
          return;
        }
      }
      closeModal();
      await refresh();
    } catch {
      setError("Błąd sieci");
    } finally {
      setSaving(false);
    }
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
              disabled={busy || saving}
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

      <Modal open={modalOpen} title={editing ? "Edycja zadania" : "Nowe zadanie"} onClose={() => !saving && closeModal()} size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveTask(e);
          }}
          className="space-y-3"
        >
          {error && modalOpen ? <Alert variant="error">{error}</Alert> : null}
          <Field label="Tytuł">
            <Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} disabled={saving} required />
          </Field>
          <Field label="Opis (opcjonalnie)">
            <Textarea rows={3} value={formDescription} onChange={(e) => setFormDescription(e.target.value)} disabled={saving} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data rozpoczęcia (opcjonalnie)">
              <Input type="date" value={formPlannedStart} onChange={(e) => setFormPlannedStart(e.target.value)} disabled={saving} />
            </Field>
            <Field label="Termin / data zakończenia (opcjonalnie)">
              <Input type="date" value={formPlannedEnd} onChange={(e) => setFormPlannedEnd(e.target.value)} disabled={saving} />
            </Field>
          </div>
          <Field label="Osoba odpowiedzialna">
            <Input
              value={formAssignee}
              onChange={(e) => setFormAssignee(e.target.value)}
              disabled={saving}
              placeholder="np. Jan Kowalski"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select value={formStatus} onChange={(e) => setFormStatus(e.target.value as typeof formStatus)} disabled={saving || formIsDone}>
                <option value="TODO">{TASK_STATUS_LABEL.TODO}</option>
                <option value="IN_PROGRESS">{TASK_STATUS_LABEL.IN_PROGRESS}</option>
                <option value="DONE">{TASK_STATUS_LABEL.DONE}</option>
              </Select>
            </Field>
            <Field label="Priorytet (opcjonalnie)">
              <Select value={formPriority} onChange={(e) => setFormPriority(e.target.value as typeof formPriority)} disabled={saving}>
                <option value="">—</option>
                <option value="LOW">{PRIORITY_LABEL.LOW}</option>
                <option value="NORMAL">{PRIORITY_LABEL.NORMAL}</option>
                <option value="HIGH">{PRIORITY_LABEL.HIGH}</option>
              </Select>
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={formIsDone}
              onChange={(e) => setFormIsDone(e.target.checked)}
              disabled={saving}
            />
            Wykonane
          </label>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Anuluj
            </Button>
            <Button type="submit" disabled={saving}>
              Zapisz
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
