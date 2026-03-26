"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";

type Row = {
  id: string;
  name: string;
  code: string | null;
  clientName: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Draft = {
  id?: string;
  name: string;
  code: string | null;
  clientName: string | null;
  description: string | null;
  isActive: boolean;
};

function emptyDraft(): Draft {
  return {
    name: "",
    code: null,
    clientName: null,
    description: null,
    isActive: true,
  };
}

export function ProjectsClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "1" | "0">("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const sp = new URLSearchParams();
      if (q.trim()) sp.set("q", q.trim());
      if (activeFilter === "1") sp.set("active", "true");
      if (activeFilter === "0") sp.set("active", "false");
      const qs = sp.toString();
      const r = await fetch(`/api/projects${qs ? `?${qs}` : ""}`);
      const j = await r.json();
      if (!r.ok) throw new Error(readApiErrorBody(j));
      setRows(Array.isArray(j) ? j : []);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : "Nie udało się wczytać projektów");
    } finally {
      setLoading(false);
    }
  }, [q, activeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function closeModal() {
    setOpen(false);
    setFormError(null);
  }

  function openNew() {
    setEditing(emptyDraft());
    setFormError(null);
    setOpen(true);
  }

  function openEdit(r: Row) {
    setEditing({
      id: r.id,
      name: r.name,
      code: r.code,
      clientName: r.clientName,
      description: r.description,
      isActive: r.isActive,
    });
    setFormError(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const body = {
      name: editing.name.trim(),
      code: editing.code?.trim() || null,
      clientName: editing.clientName?.trim() || null,
      description: editing.description?.trim() || null,
      isActive: editing.isActive,
    };
    if (!body.name) {
      setFormError("Podaj nazwę projektu.");
      setSaving(false);
      return;
    }
    const url = editing.id ? `/api/projects/${editing.id}` : "/api/projects";
    const method = editing.id ? "PATCH" : "POST";
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      closeModal();
      load();
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Usunąć ten projekt? W dokumentach pole projektu zostanie wyczyszczone.")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Projekty</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Przypisuj projekty do kosztów, przychodów i zdarzeń planowanych. Wersja MVP — bez powiązań z regułami cyklicznymi.
          </p>
        </div>
        <Button type="button" onClick={openNew} disabled={loading}>
          Dodaj projekt
        </Button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Szukaj (nazwa, kod, klient)">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="np. budowa" disabled={loading} />
          </Field>
          <Field label="Status">
            <Select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as "" | "1" | "0")} disabled={loading}>
              <option value="">Wszystkie</option>
              <option value="1">Aktywne</option>
              <option value="0">Nieaktywne</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="button" className="w-full sm:w-auto" onClick={() => load()} disabled={loading}>
              Odśwież
            </Button>
          </div>
        </div>
      </div>

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Nazwa</th>
              <th className="px-3 py-2.5 font-semibold">Kod</th>
              <th className="px-3 py-2.5 font-semibold">Klient</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-zinc-500">
                  <Spinner className="mr-2 inline !size-5" />
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-12 text-center text-zinc-500">
                  Brak projektów. Użyj <strong>Dodaj projekt</strong>.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="bg-white dark:bg-zinc-950">
                  <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{r.name}</td>
                  <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{r.code ?? "—"}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-zinc-600 dark:text-zinc-400" title={r.clientName ?? undefined}>
                    {r.clientName ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.isActive ? <Badge variant="success">Aktywny</Badge> : <Badge variant="muted">Nieaktywny</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" className="!py-1 text-xs" onClick={() => openEdit(r)}>
                      Edytuj
                    </Button>
                    <Button variant="ghost" className="!py-1 text-xs text-red-600 dark:text-red-400" onClick={() => remove(r.id)}>
                      Usuń
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing.id ? "Edycja projektu" : "Nowy projekt"} onClose={closeModal} size="lg">
        <form onSubmit={save} className="space-y-3">
          {formError && <Alert variant="error">{formError}</Alert>}
          <Field label="Nazwa">
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required disabled={saving} />
          </Field>
          <Field label="Kod (opcjonalnie)">
            <Input value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value || null })} disabled={saving} />
          </Field>
          <Field label="Klient (opcjonalnie)">
            <Input
              value={editing.clientName ?? ""}
              onChange={(e) => setEditing({ ...editing, clientName: e.target.value || null })}
              disabled={saving}
            />
          </Field>
          <Field label="Opis (opcjonalnie)">
            <Textarea rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value || null })} disabled={saving} />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={editing.isActive}
              onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              disabled={saving}
            />
            Projekt aktywny (pokazywany domyślnie na listach wyboru)
          </label>
          <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="!size-4" /> : null}
              Zapisz
            </Button>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Anuluj
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
