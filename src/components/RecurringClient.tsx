"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { formatDate, formatMoney, toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { readApiErrorBody } from "@/lib/api-client";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { nextNOccurrences } from "@/lib/cashflow/recurring";
import { isAfter, startOfDay } from "date-fns";

type Row = {
  id: string;
  title: string;
  type: string;
  accountMode?: string;
  amount: string;
  amountVat: string | null;
  frequency: string;
  startDate: string;
  endDate: string | null;
  dayOfMonth: number | null;
  weekday: number | null;
  notes: string;
  isActive: boolean;
  incomeCategoryId: string | null;
  expenseCategoryId: string | null;
  incomeCategory?: { id: string; name: string } | null;
  expenseCategory?: { id: string; name: string } | null;
};

type Draft = Omit<Row, "id"> & { id?: string };

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDraft(): Draft {
  return {
    title: "",
    type: "EXPENSE",
    accountMode: "MAIN",
    amount: "0",
    amountVat: "0",
    frequency: "MONTHLY",
    startDate: todayYmd(),
    endDate: null,
    dayOfMonth: null,
    weekday: null,
    notes: "",
    isActive: true,
    incomeCategoryId: null,
    expenseCategoryId: null,
  };
}

function freqLabel(f: string) {
  if (f === "WEEKLY") return "Co tydzień";
  if (f === "MONTHLY") return "Co miesiąc";
  if (f === "QUARTERLY") return "Co kwartał";
  if (f === "YEARLY") return "Co rok";
  return f;
}

function accountModeLabel(m: string | undefined) {
  if (m === "VAT") return "VAT";
  if (m === "SPLIT") return "Główne + VAT";
  return "Główne";
}

function formatRecurringAmount(r: Row): string {
  const mode = r.accountMode ?? "MAIN";
  const main = Number(r.amount);
  const vat = r.amountVat != null ? Number(r.amountVat) : 0;
  if (mode === "VAT") return `${formatMoney(main)} (VAT)`;
  if (mode === "SPLIT") return `${formatMoney(main)} + ${formatMoney(vat)}`;
  return formatMoney(main);
}

type Cat = { id: string; name: string; slug: string; isActive?: boolean };

type GeneratedBlock = {
  templateType: string;
  upcomingCosts: {
    id: string;
    documentNumber: string;
    plannedPaymentDate: string;
    grossAmount: string;
    status: string;
    isRecurringDetached: boolean;
  }[];
  upcomingIncomes: {
    id: string;
    invoiceNumber: string;
    plannedIncomeDate: string;
    grossAmount: string;
    status: string;
    isRecurringDetached: boolean;
  }[];
};

export function RecurringClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [incomeCats, setIncomeCats] = useState<Cat[]>([]);
  const [expenseCats, setExpenseCats] = useState<Cat[]>([]);
  const [genBusy, setGenBusy] = useState<string | null>(null);
  const [genModalId, setGenModalId] = useState<string | null>(null);
  const [genUntilDate, setGenUntilDate] = useState(todayYmd());
  const [generatedBlock, setGeneratedBlock] = useState<GeneratedBlock | null>(null);
  const [rowToolBusy, setRowToolBusy] = useState<string | null>(null);

  const expenseCatsForForm = useMemo(() => {
    const sel = editing.expenseCategoryId;
    return expenseCats.filter((c) => c.isActive !== false || c.id === sel);
  }, [expenseCats, editing.expenseCategoryId]);

  useEffect(() => {
    Promise.all([
      fetch("/api/income-categories").then((r) => r.json()),
      fetch("/api/expense-categories").then((r) => r.json()),
    ])
      .then(([i, e]) => {
        setIncomeCats(Array.isArray(i) ? i : []);
        setExpenseCats(Array.isArray(e) ? e : []);
      })
      .catch(() => {
        setIncomeCats([]);
        setExpenseCats([]);
      });
  }, []);

  const load = useCallback(async () => {
    setListLoading(true);
    setLoadError(null);
    try {
      const r = await fetch("/api/recurring-templates");
      const j = await r.json();
      if (!r.ok) throw new Error(readApiErrorBody(j));
      setRows(Array.isArray(j) ? j : []);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : "Nie udało się wczytać listy");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open || !editing.id) {
      setGeneratedBlock(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/recurring-templates/${editing.id}/generated`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j && typeof j === "object") setGeneratedBlock(j as GeneratedBlock);
      })
      .catch(() => {
        if (!cancelled) setGeneratedBlock(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editing.id]);

  const previewDates = useMemo(() => {
    const sd = toIsoOrNull(String(editing.startDate ?? ""));
    if (!sd) return [];
    const endIso = editing.endDate ? toIsoOrNull(String(editing.endDate)) : null;
    const tmpl = {
      frequency: editing.frequency,
      startDate: new Date(sd),
      endDate: endIso ? new Date(endIso) : null,
      dayOfMonth: editing.dayOfMonth,
      weekday: editing.weekday,
    };
    const fromToday = startOfDay(new Date());
    const start = startOfDay(new Date(sd));
    /** Najbliższe wystąpienia od dziś lub od startu reguły (jeśli start jest w przyszłości). */
    const effFrom = isAfter(start, fromToday) ? start : fromToday;
    try {
      return nextNOccurrences(tmpl, 5, effFrom);
    } catch {
      return [];
    }
  }, [editing.frequency, editing.startDate, editing.endDate, editing.dayOfMonth, editing.weekday]);

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
      ...r,
      accountMode: r.accountMode ?? "MAIN",
      incomeCategoryId: r.incomeCategoryId ?? null,
      expenseCategoryId: r.expenseCategoryId ?? null,
      startDate: isoToDateInputValue(r.startDate),
      endDate: r.endDate ? isoToDateInputValue(r.endDate) : null,
      amount: String(r.amount),
      amountVat: r.amountVat != null ? String(r.amountVat) : "0",
    });
    setFormError(null);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const startDate = toIsoOrNull(String(editing.startDate ?? ""));
    if (!startDate) {
      setFormError("Ustaw poprawną datę startu.");
      setSaving(false);
      return;
    }
    const mode = editing.accountMode ?? "MAIN";
    if (mode === "SPLIT") {
      const v = Number(normalizeDecimalInput(editing.amountVat ?? "0"));
      if (!Number.isFinite(v) || v <= 0) {
        setFormError("W trybie „Główne + VAT” podaj kwotę VAT większą od zera.");
        setSaving(false);
        return;
      }
    }
    const endDate = editing.endDate ? toIsoOrNull(String(editing.endDate)) : null;
    const body = {
      title: editing.title,
      type: editing.type,
      accountMode: mode,
      amount: normalizeDecimalInput(editing.amount),
      amountVat: mode === "SPLIT" ? normalizeDecimalInput(editing.amountVat ?? "0") : null,
      incomeCategoryId: editing.type === "INCOME" ? editing.incomeCategoryId || null : null,
      expenseCategoryId: editing.type === "EXPENSE" ? editing.expenseCategoryId || null : null,
      frequency: editing.frequency,
      startDate,
      endDate: endDate ?? null,
      dayOfMonth: editing.dayOfMonth === null || editing.dayOfMonth === undefined ? null : editing.dayOfMonth,
      weekday: editing.weekday === null || editing.weekday === undefined ? null : editing.weekday,
      notes: editing.notes,
      isActive: editing.isActive,
    };
    const url = editing.id ? `/api/recurring-templates/${editing.id}` : "/api/recurring-templates";
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
    if (!confirm("Usunąć tę regułę cykliczną? (Wygenerowane dokumenty zostaną w kosztach / przychodach.)")) return;
    const res = await fetch(`/api/recurring-templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    load();
  }

  async function runRowTool(id: string, tool: "sync" | "deleteFuture" | "dedupe") {
    const key = `${id}:${tool}`;
    if (tool === "deleteFuture") {
      if (!confirm("Usunąć przyszłe wygenerowane wpisy z tej reguły (bez płatności, nieodłączone)?")) return;
    }
    if (tool === "dedupe") {
      if (!confirm("Usunąć zduplikowane przyszłe wpisy (ten sam dzień wystąpienia), zostawiając najstarszy?")) return;
    }
    setRowToolBusy(key);
    try {
      const path =
        tool === "sync" ? "sync" : tool === "deleteFuture" ? "delete-future-generated" : "dedupe-future";
      const res = await fetch(`/api/recurring-templates/${id}/${path}`, { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        alert(readApiErrorBody(j));
        return;
      }
      if (tool === "sync") {
        alert(
          `Zsynchronizowano harmonogram: utworzono ${j.created ?? 0} wpisów; usunięto przyszłych planowanych — koszty: ${j.deletedCosts ?? 0}, przychody: ${j.deletedIncomes ?? 0}.`,
        );
      } else if (tool === "deleteFuture") {
        alert(`Usunięto: koszty ${j.deletedCosts ?? 0}, przychody ${j.deletedIncomes ?? 0}.`);
      } else {
        alert(`Dedup: usunięto koszty ${j.removedCosts ?? 0}, przychody ${j.removedIncomes ?? 0}.`);
      }
      load();
    } catch {
      alert("Błąd sieci");
    } finally {
      setRowToolBusy(null);
    }
  }

  async function toggleActive(r: Row) {
    const res = await fetch(`/api/recurring-templates/${r.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !r.isActive }),
    });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    load();
  }

  function openGenerateModal(id: string) {
    setGenModalId(id);
    setGenUntilDate(todayYmd());
  }

  async function confirmGenerate() {
    if (!genModalId) return;
    const until = toIsoOrNull(genUntilDate);
    if (!until) {
      alert("Wybierz poprawną datę końcową.");
      return;
    }
    setGenBusy(genModalId);
    try {
      const res = await fetch(`/api/recurring-templates/${genModalId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ untilDate: until }),
      });
      const j = await res.json();
      if (!res.ok) {
        alert(readApiErrorBody(j));
        return;
      }
      alert(`Utworzono ${j.created ?? 0} brakujących wpisów w kosztach / przychodach (do ${genUntilDate}).`);
      setGenModalId(null);
    } catch {
      alert("Błąd sieci");
    } finally {
      setGenBusy(null);
    }
  }

  const mode = editing.accountMode ?? "MAIN";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Reguły cykliczne</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Reguła jest tylko szablonem: wygenerowane pozycje trafiają jako zwykłe faktury kosztowe lub przychodowe (z
            oznaczeniem źródła). Synchronizacja aktualizuje przyszłe wpisy w stanie „planowana”, bez płatności.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={load} disabled={listLoading}>
            Odśwież
          </Button>
          <Button type="button" onClick={openNew} disabled={listLoading}>
            Dodaj
          </Button>
        </div>
      </div>

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="overflow-x-auto rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Tytuł</th>
              <th className="px-3 py-2.5 font-semibold">Typ</th>
              <th className="px-3 py-2.5 font-semibold">Konto</th>
              <th className="px-3 py-2.5 font-semibold">Kwota</th>
              <th className="px-3 py-2.5 font-semibold">Częstotliwość</th>
              <th className="px-3 py-2.5 font-semibold">Start</th>
              <th className="px-3 py-2.5 font-semibold">Aktywny</th>
              <th className="min-w-[200px] px-3 py-2.5 font-semibold">Narzędzia</th>
              <th className="px-3 py-2.5 text-right font-semibold">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {listLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-zinc-500">
                  <Spinner className="mr-2 inline !size-5" />
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-zinc-500">
                  Brak reguł cyklicznych. Dodaj pierwszą przyciskiem <strong>Dodaj</strong>.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="bg-white transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/80">
                  <td className="max-w-[220px] px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{r.title}</td>
                  <td className="px-3 py-2">
                    {r.type === "INCOME" ? (
                      <span className="text-emerald-700 dark:text-emerald-400">Przychód</span>
                    ) : (
                      <span className="text-red-700 dark:text-red-400">Koszt</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {accountModeLabel(r.accountMode)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{formatRecurringAmount(r)}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400">{freqLabel(r.frequency)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(r.startDate)}</td>
                  <td className="px-3 py-2">
                    {r.isActive ? <Badge variant="success">Tak</Badge> : <Badge variant="muted">Nie</Badge>}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex max-w-[220px] flex-col gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        className="!py-1 !text-xs"
                        disabled={!r.isActive || genBusy !== null || rowToolBusy !== null}
                        onClick={() => openGenerateModal(r.id)}
                      >
                        {genBusy === r.id ? <Spinner className="!size-3" /> : "Brakujące do daty"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!py-1 !text-xs"
                        disabled={!r.isActive || rowToolBusy !== null || genBusy !== null}
                        onClick={() => runRowTool(r.id, "sync")}
                      >
                        {rowToolBusy === `${r.id}:sync` ? <Spinner className="!size-3" /> : "Synchronizuj"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!py-1 !text-xs"
                        disabled={rowToolBusy !== null || genBusy !== null}
                        onClick={() => runRowTool(r.id, "deleteFuture")}
                      >
                        {rowToolBusy === `${r.id}:deleteFuture` ? <Spinner className="!size-3" /> : "Usuń przyszłe"}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!py-1 !text-xs"
                        disabled={rowToolBusy !== null || genBusy !== null}
                        onClick={() => runRowTool(r.id, "dedupe")}
                      >
                        {rowToolBusy === `${r.id}:dedupe` ? <Spinner className="!size-3" /> : "Dedup"}
                      </Button>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button variant="ghost" className="!py-1 text-xs" onClick={() => openEdit(r)}>
                      Edytuj
                    </Button>
                    <Button variant="ghost" className="!py-1 text-xs" onClick={() => toggleActive(r)}>
                      {r.isActive ? "Wyłącz" : "Włącz"}
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

      <Modal
        open={genModalId !== null}
        title="Wygeneruj brakujące wpisy"
        onClose={() => setGenModalId(null)}
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Zostaną dodane tylko brakujące wystąpienia jako dokumenty w kosztach lub przychodach (do wybranej daty), bez
            usuwania istniejących rekordów. Uwzględniana jest data końca serii i horyzont aplikacji.
          </p>
          <Field label="Generuj do (włącznie)">
            <Input type="date" value={genUntilDate} onChange={(e) => setGenUntilDate(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="button" onClick={confirmGenerate} disabled={genBusy !== null}>
              {genBusy ? <Spinner className="!size-4" /> : null}
              Generuj
            </Button>
            <Button type="button" variant="secondary" onClick={() => setGenModalId(null)} disabled={genBusy !== null}>
              Anuluj
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={open}
        title={editing.id ? "Edycja reguły cyklicznej" : "Nowa reguła cykliczna"}
        onClose={closeModal}
        size="lg"
      >
        <form onSubmit={save} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          {formError && <Alert variant="error">{formError}</Alert>}
          <Field label="Tytuł">
            <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required disabled={saving} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Typ">
              <Select
                value={editing.type}
                onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                disabled={saving}
              >
                <option value="INCOME">Przychód</option>
                <option value="EXPENSE">Koszt</option>
              </Select>
            </Field>
            <Field label="Konto (prognoza)">
              <Select
                value={mode}
                onChange={(e) => setEditing({ ...editing, accountMode: e.target.value })}
                disabled={saving}
              >
                <option value="MAIN">Konto główne</option>
                <option value="VAT">Konto VAT</option>
                <option value="SPLIT">Główne + VAT</option>
              </Select>
            </Field>
          </div>
          {mode === "MAIN" && (
            <Field label="Kwota (konto główne)">
              <Input value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} required disabled={saving} />
            </Field>
          )}
          {mode === "VAT" && (
            <Field label="Kwota (konto VAT)">
              <Input value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} required disabled={saving} />
            </Field>
          )}
          {mode === "SPLIT" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kwota na koncie głównym">
                <Input value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} required disabled={saving} />
              </Field>
              <Field label="Kwota na koncie VAT">
                <Input value={editing.amountVat ?? ""} onChange={(e) => setEditing({ ...editing, amountVat: e.target.value })} required disabled={saving} />
              </Field>
            </div>
          )}
          {editing.type === "INCOME" ? (
            <Field label="Kategoria przychodu">
              <Select
                value={editing.incomeCategoryId ?? ""}
                onChange={(e) => setEditing({ ...editing, incomeCategoryId: e.target.value || null })}
                disabled={saving}
              >
                <option value="">(brak)</option>
                {incomeCats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Kategoria kosztu">
              <Select
                value={editing.expenseCategoryId ?? ""}
                onChange={(e) => setEditing({ ...editing, expenseCategoryId: e.target.value || null })}
                disabled={saving}
              >
                <option value="">(brak)</option>
                {expenseCatsForForm.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.isActive === false ? " (zarchiwizowana)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Częstotliwość">
              <Select
                value={editing.frequency}
                onChange={(e) => setEditing({ ...editing, frequency: e.target.value })}
                disabled={saving}
              >
                <option value="WEEKLY">Co tydzień</option>
                <option value="MONTHLY">Co miesiąc</option>
                <option value="QUARTERLY">Co kwartał</option>
                <option value="YEARLY">Co rok</option>
              </Select>
            </Field>
            <Field label="Dzień miesiąca (1–31, opcjonalnie — miesiąc/kwartalny/rok)">
              <Input
                type="number"
                min={1}
                max={31}
                value={editing.dayOfMonth ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditing({
                    ...editing,
                    dayOfMonth: v === "" ? null : Number(v),
                  });
                }}
                placeholder="np. 15"
                disabled={saving}
              />
            </Field>
          </div>
          <Field label="Dzień tygodnia (0=niedz. … 6=sob., dla tygodniowego)">
            <Select
              value={editing.weekday === null || editing.weekday === undefined ? "" : String(editing.weekday)}
              onChange={(e) => {
                const v = e.target.value;
                setEditing({ ...editing, weekday: v === "" ? null : Number(v) });
              }}
              disabled={saving}
            >
              <option value="">(domyślnie z daty startu)</option>
              <option value="0">Niedziela</option>
              <option value="1">Poniedziałek</option>
              <option value="2">Wtorek</option>
              <option value="3">Środa</option>
              <option value="4">Czwartek</option>
              <option value="5">Piątek</option>
              <option value="6">Sobota</option>
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data startu">
              <Input
                type="date"
                value={editing.startDate}
                onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                required
                disabled={saving}
              />
            </Field>
            <Field label="Data końca serii (opcjonalnie)">
              <Input
                type="date"
                value={editing.endDate ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditing({ ...editing, endDate: v || null });
                }}
                disabled={saving}
              />
            </Field>
          </div>
          {editing.id && generatedBlock ? (
            <div className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-950/50">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Powiązane wygenerowane wpisy</p>
              <p className="mt-1 text-xs text-zinc-500">
                Najbliższe terminy (od dziś). Otwórz pozycję na liście{" "}
                {editing.type === "EXPENSE" ? (
                  <Link href="/cost-invoices?recurringSource=generated" className="font-medium text-zinc-800 underline dark:text-zinc-200">
                    kosztów
                  </Link>
                ) : (
                  <Link
                    href="/income-invoices?recurringSource=generated"
                    className="font-medium text-zinc-800 underline dark:text-zinc-200"
                  >
                    przychodów
                  </Link>
                )}
                .
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {(editing.type === "EXPENSE" ? generatedBlock.upcomingCosts : generatedBlock.upcomingIncomes).map(
                  (row) => {
                    const num = "documentNumber" in row ? row.documentNumber : row.invoiceNumber;
                    const date =
                      "plannedPaymentDate" in row ? row.plannedPaymentDate : (row as { plannedIncomeDate: string }).plannedIncomeDate;
                    const href =
                      editing.type === "EXPENSE"
                        ? `/cost-invoices?q=${encodeURIComponent(num)}`
                        : `/income-invoices?q=${encodeURIComponent(num)}`;
                    return (
                      <li key={row.id} className="flex flex-wrap items-center gap-2">
                        <Link href={href} className="font-mono text-xs text-emerald-800 underline dark:text-emerald-300">
                          {num}
                        </Link>
                        <span className="text-zinc-500">{formatDate(date)}</span>
                        {row.isRecurringDetached ? <Badge variant="warning">odłączone</Badge> : null}
                      </li>
                    );
                  },
                )}
              </ul>
              {(editing.type === "EXPENSE" ? generatedBlock.upcomingCosts : generatedBlock.upcomingIncomes).length ===
              0 ? (
                <p className="mt-2 text-sm text-zinc-500">Brak przyszłych wpisów — użyj „Brakujące do daty” lub „Synchronizuj”.</p>
              ) : null}
            </div>
          ) : null}
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Podgląd: 5 najbliższych terminów</p>
            <p className="mt-1 text-xs text-zinc-500">
              Harmonogram: pierwsza data spełniająca regułę (dzień miesiąca / tydzień itd.) nie wcześniej niż data startu
              reguły; następnie od dziś lub od startu — która jest późniejsza.
            </p>
            {previewDates.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Uzupełnij datę startu i częstotliwość.</p>
            ) : (
              <ul className="mt-2 list-inside list-disc text-sm text-zinc-800 dark:text-zinc-200">
                {previewDates.map((d) => (
                  <li key={d.toISOString()} className="tabular-nums">
                    {formatDate(d.toISOString())}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={editing.isActive}
              onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
              disabled={saving}
            />
            Zdarzenie aktywne
          </label>
          <Field label="Notatki">
            <Textarea rows={2} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} disabled={saving} />
          </Field>
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
