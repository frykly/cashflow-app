"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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
  plannedDate: string | null;
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

export function ProjectTasksSection({ projectId, initialTasks }: { projectId: string; initialTasks: ProjectTaskRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectTaskRow | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPlanned, setFormPlanned] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formStatus, setFormStatus] = useState<"TODO" | "IN_PROGRESS" | "DONE">("TODO");
  const [formPriority, setFormPriority] = useState<"" | "LOW" | "NORMAL" | "HIGH">("");
  const [formIsDone, setFormIsDone] = useState(false);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setFormTitle("");
    setFormDescription("");
    setFormPlanned("");
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
    setFormPlanned(isoToDateInputValue(t.plannedDate));
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
      plannedDate: dateInputToIso(formPlanned),
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
          plannedDate: body.plannedDate,
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

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Zadania</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Operacyjna lista prac przy projekcie — bez wpływu na cashflow.</p>
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

      <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
        {initialTasks.length === 0 ? (
          <li className="py-8 text-center text-sm text-zinc-500">Brak zadań. Dodaj pierwsze zadanie projektu.</li>
        ) : (
          initialTasks.map((t) => {
            const busy = busyId === t.id;
            return (
              <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <div className="flex min-w-0 flex-1 gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 rounded border-zinc-300"
                    checked={t.isDone}
                    disabled={busy || saving}
                    onChange={(e) => void toggleDone(t, e.target.checked)}
                    aria-label={t.isDone ? "Oznacz jako niewykonane" : "Oznacz jako wykonane"}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-medium ${t.isDone ? "text-zinc-500 line-through" : "text-zinc-900 dark:text-zinc-100"}`}
                      >
                        {t.title}
                      </span>
                      <Badge variant={statusBadgeVariant(t.status, t.isDone)}>
                        {TASK_STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                      {t.priority ? (
                        <Badge variant="warning">{PRIORITY_LABEL[t.priority] ?? t.priority}</Badge>
                      ) : null}
                    </div>
                    {t.description ? (
                      <p className="mt-1 text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{t.description}</p>
                    ) : null}
                    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                      {t.plannedDate ? (
                        <span>
                          Plan: <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{formatDate(t.plannedDate)}</span>
                        </span>
                      ) : null}
                      {t.assigneeName ? (
                        <span>
                          Odpowiedzialny: <span className="text-zinc-700 dark:text-zinc-300">{t.assigneeName}</span>
                        </span>
                      ) : null}
                      {t.doneAt ? (
                        <span>
                          Wykonano:{" "}
                          <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{formatDate(t.doneAt)}</span>
                        </span>
                      ) : null}
                    </p>
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
              </li>
            );
          })
        )}
      </ul>

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
            <Field label="Planowana data">
              <Input type="date" value={formPlanned} onChange={(e) => setFormPlanned(e.target.value)} disabled={saving} />
            </Field>
            <Field label="Osoba odpowiedzialna">
              <Input
                value={formAssignee}
                onChange={(e) => setFormAssignee(e.target.value)}
                disabled={saving}
                placeholder="np. Jan Kowalski"
              />
            </Field>
          </div>
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