"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Field, Input, Spinner } from "@/components/ui";
import { toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { readApiErrorBody } from "@/lib/api-client";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { ExpenseCategoriesSettings } from "@/components/ExpenseCategoriesSettings";
import { ProjectDictionarySettings } from "@/components/ProjectDictionarySettings";

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
    <div className="max-w-3xl space-y-10">
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

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Statusy realizacji projektów</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Lista opcji w polu „Status realizacji” w projekcie. Wartość w bazie projektu to <code className="text-xs">slug</code> — nie zmienia się przy edycji nazwy.
        </p>
        <div className="mt-4">
          <ProjectDictionarySettings
            variant="lifecycle"
            title="realizacji"
            description="Zarchiwizowane statusy nie pojawiają się w nowych wyborach; istniejące projekty zachowują slug. Usunięcie możliwe tylko, gdy żaden projekt nie używa danego sluga."
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Statusy rozliczenia projektów</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Opcje pola „Status rozliczenia”. Slugi <code className="text-xs">COMPLETED</code> + <code className="text-xs">SETTLED</code> nadal sterują filtrem „ukryj rozliczone” na liście.
        </p>
        <div className="mt-4">
          <ProjectDictionarySettings
            variant="settlement"
            title="rozliczenia"
            description="Jak wyżej: archiwizacja ukrywa przy nowych projektach; usunięcie tylko bez użycia w polu settlementStatus projektu."
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Braki projektu</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Wielokrotny wybór w formularzu projektu (checkboxy). Przypisania są w tabeli powiązań, nie w polu tekstowym statusu.
        </p>
        <div className="mt-4">
          <ProjectDictionarySettings
            variant="missing"
            title="braków"
            description="Usunięcie typu możliwe tylko gdy żaden projekt go nie zaznaczył (brak wierszy powiązań)."
          />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Kategorie kosztów</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Lista używana przy fakturach kosztowych, imporcie bankowym i (tam gdzie dotyczy) w planie oraz cyklicznych.
        </p>
        <div className="mt-4">
          <ExpenseCategoriesSettings />
        </div>
      </section>
    </div>
  );
}
