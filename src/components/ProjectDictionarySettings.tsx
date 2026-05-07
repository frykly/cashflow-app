"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Field, Input, Modal, Spinner } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";

type DictKind = "lifecycle" | "settlement" | "missing";

type Row = { id: string; name: string; slug: string; sortOrder: number; isActive: boolean };

const API: Record<DictKind, string> = {
  lifecycle: "/api/project-lifecycle-statuses",
  settlement: "/api/project-settlement-statuses",
  missing: "/api/project-missing-types",
};

export function ProjectDictionarySettings({
  variant,
  title,
  description,
}: {
  variant: DictKind;
  title: string;
  description: string;
}) {
  const api = API[variant];
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSort, setEditSort] = useState("0");
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockMsg, setBlockMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch(api);
      const j = await r.json();
      if (!r.ok) throw new Error(readApiErrorBody(j));
      setRows(Array.isArray(j) ? j : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Błąd wczytywania");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(readApiErrorBody(j));
        return;
      }
      setNewName("");
      await load();
    } catch {
      setErr("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: string) {
    const n = editName.trim();
    const so = Number.parseInt(editSort, 10);
    if (!n || Number.isNaN(so) || so < 0) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`${api}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, sortOrder: so }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(readApiErrorBody(j));
        return;
      }
      setEditingId(null);
      await load();
    } catch {
      setErr("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function setArchived(id: string, isActive: boolean) {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`${api}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(readApiErrorBody(j));
        return;
      }
      await load();
    } catch {
      setErr("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function tryDelete(c: Row) {
    setErr(null);
    try {
      const r = await fetch(`${api}/${c.id}`, { method: "DELETE" });
      if (r.status === 204) {
        await load();
        return;
      }
      const j = await r.json().catch(() => ({}));
      if (r.status === 409) {
        setBlockMsg(readApiErrorBody(j) || "Pozycja jest używana.");
        setBlockOpen(true);
        return;
      }
      setErr(readApiErrorBody(j));
    } catch {
      setErr("Błąd sieci");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Spinner className="!size-5" />
        Wczytywanie…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err ? <Alert variant="error">{err}</Alert> : null}

      <form onSubmit={addRow} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Field label={`Nowa pozycja — ${title}`}>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={variant === "missing" ? "np. Uzgodnienia branżowe" : "np. Montaż"}
              disabled={saving}
            />
          </Field>
        </div>
        <Button type="submit" disabled={saving || !newName.trim()}>
          Dodaj
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
            <tr>
              <th className="px-3 py-2 font-medium">Kolejność</th>
              <th className="px-3 py-2 font-medium">Nazwa</th>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 font-medium">Stan</th>
              <th className="px-3 py-2 font-medium text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800/80">
                <td className="px-3 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">{c.sortOrder}</td>
                <td className="px-3 py-2">
                  {editingId === c.id ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input className="max-w-xs" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={saving} />
                      <Input
                        className="w-24"
                        inputMode="numeric"
                        value={editSort}
                        onChange={(e) => setEditSort(e.target.value)}
                        disabled={saving}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" className="!py-1 !text-xs" onClick={() => saveEdit(c.id)} disabled={saving}>
                          Zapisz
                        </Button>
                        <Button type="button" variant="secondary" className="!py-1 !text-xs" onClick={() => setEditingId(null)} disabled={saving}>
                          Anuluj
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <span className={!c.isActive ? "text-zinc-500 line-through" : ""}>{c.name}</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-500">{c.slug}</td>
                <td className="px-3 py-2">
                  {c.isActive ? (
                    <span className="text-emerald-700 dark:text-emerald-400">Aktywna</span>
                  ) : (
                    <span className="text-zinc-500">Zarchiwizowana</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  {editingId !== c.id ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!py-1 !text-xs"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                          setEditSort(String(c.sortOrder));
                        }}
                        disabled={saving}
                      >
                        Edytuj
                      </Button>
                      <Button type="button" variant="ghost" className="!py-1 !text-xs" onClick={() => setArchived(c.id, !c.isActive)} disabled={saving}>
                        {c.isActive ? "Archiwizuj" : "Przywróć"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!py-1 !text-xs text-red-600 dark:text-red-400"
                        onClick={() => void tryDelete(c)}
                        disabled={saving}
                      >
                        Usuń
                      </Button>
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">{description}</p>

      <Modal open={blockOpen} title="Nie można usunąć" onClose={() => setBlockOpen(false)} size="md">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{blockMsg}</p>
        <Button type="button" variant="secondary" className="mt-4" onClick={() => setBlockOpen(false)}>
          Zamknij
        </Button>
      </Modal>
    </div>
  );
}
