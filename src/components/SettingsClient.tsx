"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { readApiErrorBody } from "@/lib/api-client";
import { normalizeDecimalInput } from "@/lib/decimal-input";

type Row = {
  mainOpeningBalance: string;
  vatOpeningBalance: string;
  effectiveFrom: string;
};

function defaultRow(): Row {
  return {
    mainOpeningBalance: "0",
    vatOpeningBalance: "0",
    effectiveFrom: new Date().toISOString().slice(0, 10),
  };
}

export function SettingsClient() {
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : Promise.resolve(null)))
      .then((j) => {
        if (j && typeof j === "object")
          setRow({
            mainOpeningBalance: String(j.mainOpeningBalance),
            vatOpeningBalance: String(j.vatOpeningBalance),
            effectiveFrom: isoToDateInputValue(j.effectiveFrom),
          });
        else setRow(defaultRow());
      })
      .catch(() => {
        setRow(defaultRow());
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setMsg(null);
    setSaving(true);
    const effectiveFrom = toIsoOrNull(String(row.effectiveFrom ?? ""));
    if (!effectiveFrom) {
      setMsg({ type: "err", text: "Podaj poprawną datę obowiązywania sald." });
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mainOpeningBalance: normalizeDecimalInput(row.mainOpeningBalance),
          vatOpeningBalance: normalizeDecimalInput(row.vatOpeningBalance),
          effectiveFrom,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ type: "err", text: readApiErrorBody(j) });
        return;
      }
      setRow({
        mainOpeningBalance: String(j.mainOpeningBalance),
        vatOpeningBalance: String(j.vatOpeningBalance),
        effectiveFrom: isoToDateInputValue(j.effectiveFrom),
      });
      setMsg({ type: "ok", text: "Zapisano ustawienia." });
    } catch {
      setMsg({ type: "err", text: "Błąd sieci" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-zinc-500">
        <Spinner className="!size-5" />
        Ładowanie…
      </div>
    );
  }

  if (!row) return null;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Ustawienia</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Salda początkowe obowiązują od wskazanej daty (początek dnia). Wszystkie ruchy cashflow są liczone od tego punktu.
        </p>
      </div>

      {msg?.type === "ok" && <Alert variant="success">{msg.text}</Alert>}
      {msg?.type === "err" && <Alert variant="error">{msg.text}</Alert>}

      <form onSubmit={save} className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Field label="Saldo początkowe konta głównego (PLN)">
          <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={row.mainOpeningBalance}
            onChange={(e) => setRow({ ...row, mainOpeningBalance: e.target.value })}
            required
            disabled={saving}
          />
        </Field>
        <Field label="Saldo początkowe konta VAT (PLN)">
          <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={row.vatOpeningBalance}
            onChange={(e) => setRow({ ...row, vatOpeningBalance: e.target.value })}
            required
            disabled={saving}
          />
        </Field>
        <Field label="Data obowiązywania sald">
          <Input
            type="date"
            value={row.effectiveFrom}
            onChange={(e) => setRow({ ...row, effectiveFrom: e.target.value })}
            required
            disabled={saving}
          />
        </Field>
        <Button type="submit" disabled={saving}>
          {saving ? (
            <>
              <Spinner className="mr-2 !size-4" /> Zapisywanie…
            </>
          ) : (
            "Zapisz"
          )}
        </Button>
      </form>
    </div>
  );
}
