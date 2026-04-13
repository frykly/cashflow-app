"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";

type Cat = { id: string; name: string; slug: string; isActive: boolean };

type Usage = { invoices: number; planned: number; recurring: number; total: number };

export function ExpenseCategoriesSettings() {
  const [rows, setRows] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockCat, setBlockCat] = useState<Cat | null>(null);
  const [blockUsage, setBlockUsage] = useState<Usage | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState("");
  const [replaceBusy, setReplaceBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch("/api/expense-categories");
      const j = await r.json();
      if (!r.ok) throw new Error(readApiErrorBody(j));
      setRows(Array.isArray(j) ? j : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Błąd wczytywania");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/expense-categories", {
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
    if (!n) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/expense-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
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
      const r = await fetch(`/api/expense-categories/${id}`, {
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

  async function tryDelete(c: Cat) {
    setErr(null);
    try {
      const r = await fetch(`/api/expense-categories/${c.id}`, { method: "DELETE" });
      if (r.status === 204) {
        await load();
        return;
      }
      const j = await r.json();
      if (r.status === 409 && j.usage) {
        setBlockCat(c);
        setBlockUsage(j.usage as Usage);
        setReplaceTargetId("");
        setBlockOpen(true);
        return;
      }
      setErr(readApiErrorBody(j));
    } catch {
      setErr("Błąd sieci");
    }
  }

  async function confirmReassignAndDelete() {
    if (!blockCat || !replaceTargetId) return;
    setReplaceBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/expense-categories/${blockCat.id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetCategoryId: replaceTargetId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(readApiErrorBody(j));
        return;
      }
      setBlockOpen(false);
      setBlockCat(null);
      setBlockUsage(null);
      await load();
    } catch {
      setErr("Błąd sieci");
    } finally {
      setReplaceBusy(false);
    }
  }

  const targetsForReplace = rows.filter((c) => c.id !== blockCat?.id && c.isActive);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500">
        <Spinner className="!size-5" />
        Wczytywanie kategorii…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {err ? <Alert variant="error">{err}</Alert> : null}

      <form onSubmit={addCategory} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <Field label="Nowa kategoria kosztowa">
            <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="np. Tankowanie pojazdów"
            disabled={saving}
          />
          </Field>
        </div>
        <Button type="submit" disabled={saving || !newName.trim()}>
          Dodaj
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80">
            <tr>
              <th className="px-3 py-2 font-medium">Nazwa</th>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 font-medium">Stan</th>
              <th className="px-3 py-2 font-medium text-right">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-800/80">
                <td className="px-3 py-2">
                  {editingId === c.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="max-w-xs"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        disabled={saving}
                      />
                      <Button type="button" className="!py-1 !text-xs" onClick={() => saveEdit(c.id)} disabled={saving}>
                        Zapisz
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!py-1 !text-xs"
                        onClick={() => setEditingId(null)}
                        disabled={saving}
                      >
                        Anuluj
                      </Button>
                    </div>
                  ) : (
                    <span className={!c.isActive ? "text-zinc-500 line-through" : ""}>{c.name}</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-500">{c.slug}</td>
                <td className="px-3 py-2">{c.isActive ? <span className="text-emerald-700 dark:text-emerald-400">Aktywna</span> : <span className="text-zinc-500">Zarchiwizowana</span>}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {editingId !== c.id ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!py-1 !text-xs"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditName(c.name);
                        }}
                        disabled={saving}
                      >
                        Edytuj
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!py-1 !text-xs"
                        onClick={() => setArchived(c.id, !c.isActive)}
                        disabled={saving}
                      >
                        {c.isActive ? "Archiwizuj" : "Przywróć"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!py-1 !text-xs text-red-600 dark:text-red-400"
                        onClick={() => tryDelete(c)}
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

      <p className="text-xs text-zinc-500">
        Zarchiwizowane kategorie nie pojawiają się przy nowych kosztach, ale pozostają przy starych dokumentach. Usunięcie
        działa tylko dla kategorii bez przypisań; w przeciwnym razie możesz zamienić przypisania na inną kategorię.
      </p>

      <Modal open={blockOpen} title="Nie można usunąć kategorii" onClose={() => !replaceBusy && setBlockOpen(false)} size="md">
        {blockCat && blockUsage ? (
          <div className="space-y-4 text-sm">
            <p>
              Kategoria <strong>{blockCat.name}</strong> jest używana:{" "}
              <strong>{blockUsage.invoices}</strong> kosztów, <strong>{blockUsage.planned}</strong> zdarzeń planowanych,{" "}
              <strong>{blockUsage.recurring}</strong> szablonów cyklicznych.
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">Możesz zamknąć okno i zarchiwizować kategorię albo przenieść wszystkie przypisania do innej kategorii — wtedy ta kategoria zostanie usunięta.</p>
            <Field label="Przenieś wszystkie przypisania do">
              <Select value={replaceTargetId} onChange={(e) => setReplaceTargetId(e.target.value)} disabled={replaceBusy}>
                <option value="">— wybierz kategorię —</option>
                {targetsForReplace.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={confirmReassignAndDelete} disabled={replaceBusy || !replaceTargetId}>
                {replaceBusy ? "Przenoszenie…" : "Przenieś i usuń kategorię"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setBlockOpen(false)} disabled={replaceBusy}>
                Anuluj
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
