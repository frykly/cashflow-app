"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import { dateInputToIso, isoToDateInputValue } from "@/lib/date-input";
import { PRIORITY_LABEL, TASK_STATUS_LABEL, type ProjectTaskRow } from "@/lib/projects/project-task-ui";

export type ProjectTaskFormModalProps = {
  open: boolean;
  projectId: string;
  /** Opcjonalnie — podpis obok linku „Otwórz projekt”. */
  projectName?: string | null;
  /** null = tryb „nowe zadanie” (POST). */
  task: ProjectTaskRow | null;
  onClose: () => void;
  onSaved: () => void;
  /** Na stronie projektu false; na kalendarzu /tasks true — link „Otwórz projekt”. */
  showOpenProjectLink?: boolean;
};

export function ProjectTaskFormModal({
  open,
  projectId,
  projectName,
  task,
  onClose,
  onSaved,
  showOpenProjectLink = false,
}: ProjectTaskFormModalProps) {
  const [error, setError] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPlannedStart, setFormPlannedStart] = useState("");
  const [formPlannedEnd, setFormPlannedEnd] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formStatus, setFormStatus] = useState<"TODO" | "IN_PROGRESS" | "DONE">("TODO");
  const [formPriority, setFormPriority] = useState<"" | "LOW" | "NORMAL" | "HIGH">("");
  const [formIsDone, setFormIsDone] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (task) {
      setFormTitle(task.title);
      setFormDescription(task.description ?? "");
      setFormPlannedStart(isoToDateInputValue(task.plannedStartDate));
      setFormPlannedEnd(isoToDateInputValue(task.plannedEndDate));
      setFormAssignee(task.assigneeName ?? "");
      const st = task.status as "TODO" | "IN_PROGRESS" | "DONE";
      setFormStatus(st === "IN_PROGRESS" || st === "DONE" ? st : "TODO");
      setFormPriority(task.priority === "LOW" || task.priority === "NORMAL" || task.priority === "HIGH" ? task.priority : "");
      setFormIsDone(task.isDone);
    } else {
      setFormTitle("");
      setFormDescription("");
      setFormPlannedStart("");
      setFormPlannedEnd("");
      setFormAssignee("");
      setFormStatus("TODO");
      setFormPriority("");
      setFormIsDone(false);
    }
  }, [open, task]);

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
      if (task) {
        const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
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
      onClose();
      onSaved();
    } catch {
      setError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title={task ? "Edycja zadania" : "Nowe zadanie"} onClose={() => !saving && onClose()} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void saveTask(e);
        }}
        className="space-y-3"
      >
        {error && open ? <Alert variant="error">{error}</Alert> : null}
        {showOpenProjectLink && projectId ? (
          <p className="text-sm">
            <Link
              href={`/projects/${projectId}`}
              className="font-medium text-sky-800 underline decoration-sky-700/40 underline-offset-2 hover:text-sky-950 dark:text-sky-300 dark:hover:text-sky-200"
            >
              Otwórz projekt
            </Link>
            {projectName ? <span className="text-zinc-500 dark:text-zinc-500"> · {projectName}</span> : null}
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
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Anuluj
          </Button>
          <Button type="submit" disabled={saving}>
            Zapisz
          </Button>
        </div>
      </form>
    </Modal>
  );
}
