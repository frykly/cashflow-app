"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { readApiErrorBody } from "@/lib/api-client";
import { formatVehicleLabel } from "@/lib/accounting/vehicle-label";

type Vehicle = {
  id: string;
  registrationNumber: string;
  name: string | null;
  make: string | null;
  model: string | null;
  isActive: boolean;
  notes: string | null;
};

export function VehiclesSettings() {
  const [rows, setRows] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reg, setReg] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await fetch("/api/vehicles");
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

  async function addVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!reg.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registrationNumber: reg,
          make: make || null,
          model: model || null,
          name: name || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(readApiErrorBody(j));
        return;
      }
      setReg("");
      setMake("");
      setModel("");
      setName("");
      await load();
    } catch {
      setErr("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function setActive(id: string, isActive: boolean) {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch(`/api/vehicles/${id}`, {
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

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Pojazdy</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Rejestr samochodów do powiązania z fakturami kosztowymi (opcjonalnie).
      </p>
      {err ? <Alert variant="error">{err}</Alert> : null}
      <form onSubmit={addVehicle} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Rejestracja">
          <Input value={reg} onChange={(e) => setReg(e.target.value)} required disabled={saving} />
        </Field>
        <Field label="Marka">
          <Input value={make} onChange={(e) => setMake(e.target.value)} disabled={saving} />
        </Field>
        <Field label="Model">
          <Input value={model} onChange={(e) => setModel(e.target.value)} disabled={saving} />
        </Field>
        <Field label="Etykieta (opcjonalnie)">
          <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={saving || !reg.trim()}>
            {saving ? <Spinner className="!size-4" /> : null}
            Dodaj
          </Button>
        </div>
      </form>
      {loading ? (
        <p className="mt-3 text-sm text-zinc-500">
          <Spinner className="mr-2 inline !size-4" />
          Ładowanie…
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          {rows.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className={v.isActive ? "" : "text-zinc-400 line-through"}>
                {formatVehicleLabel(v)}
              </span>
              <Button
                type="button"
                variant="secondary"
                className="!py-1 !text-xs"
                disabled={saving}
                onClick={() => void setActive(v.id, !v.isActive)}
              >
                {v.isActive ? "Archiwizuj" : "Przywróć"}
              </Button>
            </li>
          ))}
          {rows.length === 0 ? <li className="py-2 text-sm text-zinc-500">Brak pojazdów.</li> : null}
        </ul>
      )}
    </section>
  );
}
