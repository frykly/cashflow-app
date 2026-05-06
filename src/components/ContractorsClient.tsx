"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Field, Input, Modal, Spinner } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";

type AliasRow = {
  id?: string;
  aliasName: string;
  normalizedAlias?: string;
  source: string | null;
};

type ContractorRow = {
  id: string;
  displayName: string;
  normalizedName: string;
  taxId: string | null;
  type: string | null;
  notes?: string | null;
  aliases: AliasRow[];
  createdAt: string;
  updatedAt: string;
};

type Draft = {
  id?: string;
  displayName: string;
  taxId: string;
  type: string;
  aliases: AliasRow[];
};

function emptyDraft(): Draft {
  return {
    displayName: "",
    taxId: "",
    type: "",
    aliases: [],
  };
}

function draftFromRow(row: ContractorRow): Draft {
  return {
    id: row.id,
    displayName: row.displayName,
    taxId: row.taxId ?? "",
    type: row.type ?? "",
    aliases: row.aliases.map((a) => ({
      id: a.id,
      aliasName: a.aliasName,
      source: a.source ?? "",
    })),
  };
}

export function ContractorsClient() {
  const [rows, setRows] = useState<ContractorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setQDebounced(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const sp = new URLSearchParams();
      if (qDebounced) sp.set("q", qDebounced);
      const res = await fetch(`/api/contractors${sp.toString() ? `?${sp.toString()}` : ""}`);
      const j = await res.json();
      if (!res.ok) throw new Error(readApiErrorBody(j));
      setRows(Array.isArray(j) ? j : []);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : "Nie udało się wczytać kontrahentów");
    } finally {
      setLoading(false);
    }
  }, [qDebounced]);

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

  function openEdit(row: ContractorRow) {
    setEditing(draftFromRow(row));
    setFormError(null);
    setOpen(true);
  }

  function updateAlias(idx: number, patch: Partial<AliasRow>) {
    setEditing((prev) => ({
      ...prev,
      aliases: prev.aliases.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
  }

  function removeAlias(idx: number) {
    setEditing((prev) => ({
      ...prev,
      aliases: prev.aliases.filter((_, i) => i !== idx),
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    const body = {
      displayName: editing.displayName.trim(),
      taxId: editing.taxId.trim() || null,
      type: editing.type.trim() || null,
      aliases: editing.aliases
        .map((a) => ({
          aliasName: a.aliasName.trim(),
          source: String(a.source ?? "").trim() || null,
        }))
        .filter((a) => a.aliasName),
    };

    try {
      const res = await fetch(editing.id ? `/api/contractors/${editing.id}` : "/api/contractors", {
        method: editing.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      closeModal();
      await load();
    } catch {
      setFormError("Błąd sieci przy zapisie kontrahenta");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: ContractorRow) {
    if (!window.confirm("Usunąć kontrahenta i jego aliasy? Nie wpłynie to na istniejące faktury.")) return;
    const res = await fetch(`/api/contractors/${row.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Kontrahenci</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Bezpieczny katalog referencyjny nazw i aliasów. Nie zmienia istniejących faktur ani importów.
          </p>
        </div>
        <Button type="button" onClick={openNew}>
          Dodaj kontrahenta
        </Button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
        <Field label="Szukaj po nazwie, NIP albo aliasie">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="np. P4, 9512120077, nazwa z banku" />
        </Field>
      </div>

      {loadError ? <Alert variant="error">{loadError}</Alert> : null}

      <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <table className="w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900">
            <tr>
              <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">Kontrahent</th>
              <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">NIP / typ</th>
              <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">Aliasy</th>
              <th className="border-b border-zinc-200 px-3 py-2 text-right dark:border-zinc-800">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-zinc-500">
                  <Spinner className="mr-2 inline !size-5" />
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-zinc-500">
                  Brak kontrahentów w katalogu.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="bg-white align-top dark:bg-zinc-950">
                  <td className="px-3 py-3">
                    <Link href={`/contractors/${row.id}`} className="font-medium text-blue-700 underline dark:text-blue-300">
                      {row.displayName}
                    </Link>
                    <div className="mt-1 font-mono text-xs text-zinc-500">{row.normalizedName}</div>
                  </td>
                  <td className="px-3 py-3 text-zinc-700 dark:text-zinc-300">
                    <div>{row.taxId || "—"}</div>
                    {row.type ? <div className="mt-1 text-xs text-zinc-500">{row.type}</div> : null}
                  </td>
                  <td className="px-3 py-3">
                    {row.aliases.length === 0 ? (
                      <span className="text-zinc-500">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {row.aliases.map((a) => (
                          <span key={a.id ?? `${a.aliasName}-${a.source}`} title={a.normalizedAlias}>
                            <Badge variant="muted">
                              {a.aliasName}
                              {a.source ? ` · ${a.source}` : ""}
                            </Badge>
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="ghost" className="!py-1.5 !text-xs" onClick={() => openEdit(row)}>
                        Edytuj
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="!py-1.5 !text-xs text-red-600 dark:text-red-400"
                        onClick={() => void remove(row)}
                      >
                        Usuń
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} title={editing.id ? "Edycja kontrahenta" : "Nowy kontrahent"} onClose={closeModal} size="lg">
        <form onSubmit={save} className="space-y-4">
          {formError ? <Alert variant="error">{formError}</Alert> : null}

          <Field label="Nazwa główna">
            <Input
              value={editing.displayName}
              onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
              required
              disabled={saving}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="NIP">
              <Input value={editing.taxId} onChange={(e) => setEditing({ ...editing, taxId: e.target.value })} disabled={saving} />
            </Field>
            <Field label="Typ">
              <Input
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                placeholder="np. customer, vendor"
                disabled={saving}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Aliasy nazw</span>
              <Button
                type="button"
                variant="secondary"
                className="!py-1.5 !text-xs"
                disabled={saving}
                onClick={() =>
                  setEditing((prev) => ({
                    ...prev,
                    aliases: [...prev.aliases, { aliasName: "", source: "manual" }],
                  }))
                }
              >
                + Alias
              </Button>
            </div>

            {editing.aliases.length === 0 ? (
              <p className="text-sm text-zinc-500">Brak aliasów. Możesz dodać nazwy z banku, PDF lub KSeF.</p>
            ) : (
              <div className="space-y-2">
                {editing.aliases.map((alias, idx) => (
                  <div key={idx} className="grid gap-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800 sm:grid-cols-[1fr_10rem_auto]">
                    <Field label="Alias">
                      <Input
                        value={alias.aliasName}
                        onChange={(e) => updateAlias(idx, { aliasName: e.target.value })}
                        disabled={saving}
                      />
                    </Field>
                    <Field label="Źródło">
                      <Input
                        value={alias.source ?? ""}
                        onChange={(e) => updateAlias(idx, { source: e.target.value })}
                        placeholder="manual"
                        disabled={saving}
                      />
                    </Field>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        className="!py-2 text-red-600 dark:text-red-400"
                        disabled={saving}
                        onClick={() => removeAlias(idx)}
                      >
                        Usuń
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
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
