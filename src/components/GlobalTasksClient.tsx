"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Badge, Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import { dateInputToIso, isoToDateInputValue } from "@/lib/date-input";
import { formatDate } from "@/lib/format";
import { type GlobalProjectTaskRow, type GlobalTaskTabCounts, type GlobalTaskView, type GlobalTaskSort, defaultSortForView } from "@/lib/projects/global-task-filters";
import {
  TASK_STATUS_LABEL,
  PRIORITY_LABEL,
  statusBadgeVariant,
  priorityBadgeVariant,
  scheduleLabel,
  isTaskOverdue,
  isTaskToday,
  type ProjectTaskRow,
} from "@/lib/projects/project-task-ui";

function normalizeSortForView(view: GlobalTaskView, sort: GlobalTaskSort): GlobalTaskSort {
  if (view !== "done" && sort === "done_new") return "deadline";
  return sort;
}

function tasksHref(view: GlobalTaskView, assignee: string, sort: GlobalTaskSort): string {
  const p = new URLSearchParams();
  p.set("view", view);
  if (assignee.trim()) p.set("assignee", assignee.trim());
  const s = normalizeSortForView(view, sort);
  if (s !== defaultSortForView(view)) p.set("sort", s);
  return `/tasks?${p.toString()}`;
}

type Props = {
  tasks: GlobalProjectTaskRow[];
  view: GlobalTaskView;
  tabCounts: GlobalTaskTabCounts;
  assignee: string;
  sort: GlobalTaskSort;
};

const SORT_OPTIONS_BASE: { value: GlobalTaskSort; label: string }[] = [
  { value: "deadline", label: "Termin najbliżej" },
  { value: "start", label: "Start najbliżej" },
  { value: "created_new", label: "Utworzone najnowsze" },
  { value: "created_old", label: "Utworzone najstarsze" },
];

const SORT_OPTION_DONE: { value: GlobalTaskSort; label: string } = {
  value: "done_new",
  label: "Data wykonania (najnowsze)",
};

const TABS: { id: GlobalTaskView; label: string; countKey: keyof GlobalTaskTabCounts }[] = [
  { id: "active", label: "Wszystkie aktywne", countKey: "active" },
  { id: "overdue", label: "Zaległe", countKey: "overdue" },
  { id: "today", label: "Dzisiaj", countKey: "today" },
  { id: "week", label: "Ten tydzień", countKey: "week" },
  { id: "done", label: "Wykonane", countKey: "done" },
];

export function GlobalTasksClient({ tasks, view, tabCounts, assignee, sort }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<GlobalProjectTaskRow | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPlannedStart, setFormPlannedStart] = useState("");
  const [formPlannedEnd, setFormPlannedEnd] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formStatus, setFormStatus] = useState<"TODO" | "IN_PROGRESS" | "DONE">("TODO");
  const [formPriority, setFormPriority] = useState<"" | "LOW" | "NORMAL" | "HIGH">("");
  const [formIsDone, setFormIsDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    router.refresh();
  }

  function openEdit(t: GlobalProjectTaskRow) {
    setEditing(t);
    setFormTitle(t.title);
    setFormDescription(t.description ?? "");
    setFormPlannedStart(isoToDateInputValue(t.plannedStartDate));
    setFormPlannedEnd(isoToDateInputValue(t.plannedEndDate));
    setFormAssignee(t.assigneeName ?? "");
    const st = t.status as "TODO" | "IN_PROGRESS" | "DONE";
    setFormStatus(st === "IN_PROGRESS" || st === "DONE" ? st : "TODO");
    setFormPriority(t.priority === "LOW" || t.priority === "NORMAL" || t.priority === "HIGH" ? t.priority : "");
    setFormIsDone(t.isDone);
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  function reconcileStatusForSave(): "TODO" | "IN_PROGRESS" | "DONE" {
    if (formIsDone) return "DONE";
    if (formStatus === "DONE") return "TODO";
    return formStatus;
  }

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const title = formTitle.trim();
    if (!title) {
      setError("Podaj tytuł zadania.");
      return;
    }
    setSaving(true);
    setError(null);
    const statusSave = reconcileStatusForSave();
    const body = {
      title,
      description: formDescription.trim() || null,
      assigneeName: formAssignee.trim() || null,
      plannedStartDate: dateInputToIso(formPlannedStart),
      plannedEndDate: dateInputToIso(formPlannedEnd),
      status: statusSave,
      priority: formPriority === "" ? null : formPriority,
      isDone: formIsDone,
    };
    try {
      const res = await fetch(`/api/projects/${editing.projectId}/tasks/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(readApiErrorBody(j));
        return;
      }
      closeModal();
      await refresh();
    } catch {
      setError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function toggleDone(t: GlobalProjectTaskRow, done: boolean) {
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${t.projectId}/tasks/${t.id}`, {
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

  async function deleteTask(t: GlobalProjectTaskRow) {
    if (!confirm(`Usunąć zadanie „${t.title}”?`)) return;
    setBusyId(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${t.projectId}/tasks/${t.id}`, { method: "DELETE" });
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

  function renderRow(t: GlobalProjectTaskRow) {
    const row: ProjectTaskRow = t;
    const busy = busyId === t.id;
    const tone = t.isDone ? "done" : "active";
    const overdue = tone === "active" && isTaskOverdue(row);
    const today = tone === "active" && isTaskToday(row);
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
                <Link
                  href={`/projects/${t.projectId}`}
                  className="shrink-0 rounded-md bg-zinc-200/80 px-1.5 py-0.5 text-xs font-medium text-zinc-800 hover:bg-zinc-300/90 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                >
                  {t.projectName}
                </Link>
                <Badge variant={statusBadgeVariant(t.status, t.isDone)}>
                  {TASK_STATUS_LABEL[t.status] ?? t.status}
                </Badge>
                {tone === "active" && overdue ? <Badge variant="danger">Zaległe</Badge> : null}
                {tone === "active" && today ? <Badge variant="warning">Dzisiaj</Badge> : null}
                {t.priority ? (
                  <Badge variant={priorityBadgeVariant(t.priority)}>{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
                ) : null}
              </div>
              {t.description ? (
                <p
                  className={`mt-1 text-sm whitespace-pre-wrap ${tone === "done" ? "text-zinc-500 dark:text-zinc-500" : "text-zinc-600 dark:text-zinc-400"}`}
                >
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
                    <span className="tabular-nums text-zinc-800 dark:text-zinc-200">{scheduleLabel(row)}</span>
                  ) : (
                    scheduleLabel(row)
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Zadania</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Wszystkie zadania projektów — ta sama logika co na karcie projektu.
        </p>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        {TABS.map((tab) => {
          const href = tasksHref(tab.id, assignee, sort);
          const active = view === tab.id;
          const n = tabCounts[tab.countKey];
          return (
            <Link
              key={tab.id}
              href={href}
              className={
                active
                  ? "rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
              }
            >
              {tab.label}
              <span className="ml-1 tabular-nums opacity-80">({n})</span>
            </Link>
          );
        })}
      </div>

      <form method="get" action="/tasks" className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <input type="hidden" name="view" value={view} />
        <div className="min-w-[180px] flex-1">
          <Field label="Odpowiedzialny (zawiera)">
            <Input type="search" name="assignee" defaultValue={assignee} placeholder="np. Jan" />
          </Field>
        </div>
        <div className="w-full min-w-[200px] sm:w-56">
          <Field label="Sortowanie">
            <Select name="sort" defaultValue={normalizeSortForView(view, sort)}>
              {(view === "done" ? [...SORT_OPTIONS_BASE, SORT_OPTION_DONE] : SORT_OPTIONS_BASE).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="secondary" className="shrink-0">
          Zastosuj
        </Button>
      </form>

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          Brak zadań w tym widoku.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">{tasks.map((t) => renderRow(t))}</ul>
      )}

      <Modal open={modalOpen} title="Edycja zadania" onClose={() => !saving && closeModal()} size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void saveTask(e);
          }}
          className="space-y-3"
        >
          {error && modalOpen ? <Alert variant="error">{error}</Alert> : null}
          {editing ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Projekt:{" "}
              <Link href={`/projects/${editing.projectId}`} className="font-medium text-zinc-900 underline dark:text-zinc-100">
                {editing.projectName}
              </Link>
            </p>
          ) : null}
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
    </div>
  );
}
