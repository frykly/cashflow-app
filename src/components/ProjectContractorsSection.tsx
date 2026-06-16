"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert, Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";

export type ProjectContractorRow = {
  id: string;
  projectId: string;
  contractorId: string;
  role: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  contractor: {
    id: string;
    displayName: string;
    taxId: string | null;
    type: string | null;
  };
};

type ContractorOption = {
  id: string;
  displayName: string;
  taxId: string | null;
  type: string | null;
};

type EditableRow = ProjectContractorRow & {
  draftRole: string;
  draftNotes: string;
  saving?: boolean;
};

function toEditable(row: ProjectContractorRow): EditableRow {
  return {
    ...row,
    draftRole: row.role ?? "",
    draftNotes: row.notes ?? "",
  };
}

export function ProjectContractorsSection({
  projectId,
  initialLinks,
}: {
  projectId: string;
  initialLinks: ProjectContractorRow[];
}) {
  const [links, setLinks] = useState<EditableRow[]>(() => initialLinks.map(toEditable));
  const [contractors, setContractors] = useState<ContractorOption[]>([]);
  const [contractorsLoaded, setContractorsLoaded] = useState(false);
  const [selectedContractorId, setSelectedContractorId] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const linkedContractorIds = useMemo(() => new Set(links.map((l) => l.contractorId)), [links]);
  const contractorOptions = contractors.filter((c) => !linkedContractorIds.has(c.id));

  async function loadContractors() {
    if (contractorsLoaded || loadingOptions) return;
    setLoadingOptions(true);
    try {
      const res = await fetch("/api/contractors");
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: readApiErrorBody(data) });
        return;
      }
      setContractors(Array.isArray(data) ? data : []);
      setContractorsLoaded(true);
    } catch {
      setMsg({ type: "err", text: "Nie udało się wczytać kontrahentów." });
    } finally {
      setLoadingOptions(false);
    }
  }

  async function addContractor(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContractorId) {
      setMsg({ type: "err", text: "Wybierz kontrahenta." });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/contractors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractorId: selectedContractorId, role, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: readApiErrorBody(data) });
        return;
      }
      setLinks((prev) => [...prev, toEditable(data as ProjectContractorRow)]);
      setSelectedContractorId("");
      setRole("");
      setNotes("");
      setMsg({ type: "ok", text: "Wykonawca przypisany do projektu." });
    } catch {
      setMsg({ type: "err", text: "Błąd sieci przy dodawaniu wykonawcy." });
    } finally {
      setSaving(false);
    }
  }

  async function saveLink(row: EditableRow) {
    setLinks((prev) => prev.map((l) => (l.id === row.id ? { ...l, saving: true } : l)));
    setMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/contractors/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: row.draftRole, notes: row.draftNotes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: readApiErrorBody(data) });
        return;
      }
      setLinks((prev) => prev.map((l) => (l.id === row.id ? toEditable(data as ProjectContractorRow) : l)));
      setMsg({ type: "ok", text: "Powiązanie zapisane." });
    } catch {
      setMsg({ type: "err", text: "Błąd sieci przy zapisie powiązania." });
    } finally {
      setLinks((prev) => prev.map((l) => (l.id === row.id ? { ...l, saving: false } : l)));
    }
  }

  async function removeLink(row: EditableRow) {
    if (!confirm(`Usunąć powiązanie z kontrahentem „${row.contractor.displayName}”?`)) return;
    setLinks((prev) => prev.map((l) => (l.id === row.id ? { ...l, saving: true } : l)));
    setMsg(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/contractors/${row.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: readApiErrorBody(data) });
        return;
      }
      setLinks((prev) => prev.filter((l) => l.id !== row.id));
      setMsg({ type: "ok", text: "Powiązanie usunięte. Projekt i kontrahent zostały bez zmian." });
    } catch {
      setMsg({ type: "err", text: "Błąd sieci przy usuwaniu powiązania." });
    } finally {
      setLinks((prev) => prev.map((l) => (l.id === row.id ? { ...l, saving: false } : l)));
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Wykonawcy / kontrahenci</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Dodatkowe powiązanie wykonawcze. Nie zastępuje klienta projektu i nie wpływa na faktury ani cashflow.
        </p>
      </div>

      {msg ? <Alert variant={msg.type === "ok" ? "success" : "error"}>{msg.text}</Alert> : null}

      <form onSubmit={(e) => void addContractor(e)} className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Field label="Kontrahent z katalogu">
          <Select
            value={selectedContractorId}
            onFocus={() => void loadContractors()}
            onChange={(e) => setSelectedContractorId(e.target.value)}
            disabled={saving}
          >
            <option value="">{loadingOptions ? "Ładowanie..." : "Wybierz kontrahenta"}</option>
            {contractorOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
                {c.taxId ? ` · NIP ${c.taxId}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Rola / zakres">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="np. elektryk, podwykonawca" disabled={saving} />
        </Field>
        <div className="lg:col-span-2">
          <Field label="Notatka">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} disabled={saving} />
          </Field>
        </div>
        <div className="lg:col-span-2">
          <Button type="submit" disabled={saving || !selectedContractorId}>
            {saving ? <Spinner className="!size-4" /> : null}
            Dodaj wykonawcę
          </Button>
        </div>
      </form>

      <div className="mt-5 space-y-3">
        {links.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-4 text-sm text-zinc-500 dark:border-zinc-800">
            Brak przypisanych wykonawców.
          </p>
        ) : (
          links.map((row) => {
            const dirty = row.draftRole !== (row.role ?? "") || row.draftNotes !== (row.notes ?? "");
            return (
              <div key={row.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Link
                      href={`/contractors/${row.contractor.id}`}
                      className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-600 dark:text-zinc-100 dark:decoration-zinc-600"
                    >
                      {row.contractor.displayName}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      {[row.contractor.type, row.contractor.taxId ? `NIP ${row.contractor.taxId}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" disabled={row.saving || !dirty} onClick={() => void saveLink(row)}>
                      {row.saving ? <Spinner className="!size-4" /> : null}
                      Zapisz
                    </Button>
                    <Button type="button" variant="ghost" disabled={row.saving} onClick={() => void removeLink(row)}>
                      Usuń
                    </Button>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Field label="Rola / zakres">
                    <Input
                      value={row.draftRole}
                      onChange={(e) =>
                        setLinks((prev) => prev.map((l) => (l.id === row.id ? { ...l, draftRole: e.target.value } : l)))
                      }
                      disabled={row.saving}
                    />
                  </Field>
                  <Field label="Notatka">
                    <Textarea
                      value={row.draftNotes}
                      onChange={(e) =>
                        setLinks((prev) => prev.map((l) => (l.id === row.id ? { ...l, draftNotes: e.target.value } : l)))
                      }
                      rows={2}
                      disabled={row.saving}
                    />
                  </Field>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
