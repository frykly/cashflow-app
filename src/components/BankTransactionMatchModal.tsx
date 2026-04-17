"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { formatPlnFromGrosze } from "@/lib/bank-import/format-pln";
import { formatMoney, safeFormatDate } from "@/lib/format";
import { round2 } from "@/lib/cashflow/money";
import { Input } from "@/components/ui";

type Suggestion = { id: string; score: number; grossAmount: string };

type CostS = Suggestion & {
  documentNumber: string;
  supplier: string;
  documentDate: string;
  remainingGross: string;
  canFitFullPayment: boolean;
};
type IncS = Suggestion & {
  invoiceNumber: string;
  contractor: string;
  issueDate: string;
  vatDestination: string;
  netAmount: string;
  vatAmount: string;
  splitBlocked: boolean;
  remainingGross: string;
  canFitFullPayment: boolean;
};

type PlannedE = {
  id: string;
  title: string;
  plannedDate: string;
  totalGross: string;
  score: number;
  projectLabel: string;
  categoryName: string | null;
};

function rowMatchesQuery(q: string, parts: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = parts.filter(Boolean).join(" ").toLowerCase();
  return hay.includes(needle);
}

function defaultBankIncomeSplit(inv: IncS, paymentGrossPln: number): { main: string; vat: string } {
  if (inv.vatDestination !== "VAT") return { main: "", vat: "" };
  const G = Number(inv.grossAmount);
  if (!(G > 0) || !Number.isFinite(paymentGrossPln)) return { main: "0.00", vat: "0.00" };
  const net = Number(inv.netAmount);
  const vat = Number(inv.vatAmount);
  const ratio = paymentGrossPln / G;
  const vPart = round2(vat * ratio);
  const mPart = round2(paymentGrossPln - vPart);
  return { main: mPart.toFixed(2), vat: vPart.toFixed(2) };
}

type Props = {
  transactionId: string;
  /** Kwota w groszach: &gt;0 wpłata → tylko przychody; &lt;0 wydatek → tylko koszty */
  transactionAmountGrosze: number;
  transactionDescription: string;
  /** Przychód bez faktury tylko z konta MAIN */
  transactionAccountType: string;
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
};

export function BankTransactionMatchModal({
  transactionId,
  transactionAmountGrosze,
  transactionDescription,
  transactionAccountType,
  open,
  onClose,
  onLinked,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costs, setCosts] = useState<CostS[]>([]);
  const [incomes, setIncomes] = useState<IncS[]>([]);
  const [plannedExpenses, setPlannedExpenses] = useState<PlannedE[]>([]);
  const [listFilter, setListFilter] = useState("");
  const [busy, setBusy] = useState(false);
  /** Kwota VAT (PLN) dla przychodu bez faktury — puste = 0 */
  const [otherIncomeVat, setOtherIncomeVat] = useState("");
  /** Podział MAIN/VAT dla wpłaty na fakturę VAT (kwota z transakcji) */
  const [incomeSplitDraft, setIncomeSplitDraft] = useState<Record<string, { main: string; vat: string }>>({});

  const load = useCallback(async () => {
    if (!open || !transactionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bank-transactions/${transactionId}/match-suggestions`);
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      const data = (await res.json()) as {
        suggestions: { costs: CostS[]; incomes: IncS[]; plannedExpenses?: PlannedE[] };
      };
      setCosts(data.suggestions.costs ?? []);
      setIncomes(data.suggestions.incomes ?? []);
      setPlannedExpenses(data.suggestions.plannedExpenses ?? []);
    } finally {
      setLoading(false);
    }
  }, [open, transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) {
      setOtherIncomeVat("");
      setIncomeSplitDraft({});
      setListFilter("");
    }
  }, [open]);

  const filteredCosts = useMemo(
    () =>
      costs.filter((c) =>
        rowMatchesQuery(listFilter, [
          c.documentNumber,
          c.supplier,
          c.grossAmount,
          c.remainingGross,
          safeFormatDate(c.documentDate),
        ]),
      ),
    [costs, listFilter],
  );

  const filteredIncomes = useMemo(
    () =>
      incomes.filter((c) =>
        rowMatchesQuery(listFilter, [
          c.invoiceNumber,
          c.contractor,
          c.grossAmount,
          c.remainingGross,
          safeFormatDate(c.issueDate),
        ]),
      ),
    [incomes, listFilter],
  );

  const filteredPlanned = useMemo(
    () =>
      plannedExpenses.filter((p) =>
        rowMatchesQuery(listFilter, [p.title, p.projectLabel, p.categoryName, p.totalGross, safeFormatDate(p.plannedDate)]),
      ),
    [plannedExpenses, listFilter],
  );

  useEffect(() => {
    if (!open || incomes.length === 0) return;
    const payPln = Math.abs(transactionAmountGrosze) / 100;
    setIncomeSplitDraft((prev) => {
      const next = { ...prev };
      for (const row of incomes) {
        if (
          row.vatDestination === "VAT" &&
          !row.splitBlocked &&
          row.canFitFullPayment &&
          next[row.id] == null
        ) {
          next[row.id] = defaultBankIncomeSplit(row, payPln);
        }
      }
      return next;
    });
  }, [open, incomes, transactionAmountGrosze]);

  async function linkCost(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bank-transactions/${transactionId}/link-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costInvoiceId: id }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      onLinked();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function linkIncome(id: string) {
    setBusy(true);
    setError(null);
    try {
      const inv = incomes.find((r) => r.id === id);
      const payPln = Math.abs(transactionAmountGrosze) / 100;
      const body: Record<string, unknown> = { incomeInvoiceId: id };
      if (inv?.vatDestination === "VAT" && !inv.splitBlocked && inv.canFitFullPayment) {
        const d = incomeSplitDraft[id] ?? defaultBankIncomeSplit(inv, payPln);
        body.incomeSplit = {
          allocatedMainAmount: d.main,
          allocatedVatAmount: d.vat,
        };
      }
      const res = await fetch(`/api/bank-transactions/${transactionId}/link-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      onLinked();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function createCostFromPlanned(plannedEventId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/bank-transactions/${transactionId}/create-cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedEventId }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      onLinked();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function addOtherIncomeNoInvoice() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/other-income", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bankTransactionId: transactionId,
          description: transactionDescription.trim() || undefined,
          vatAmount: otherIncomeVat.trim() === "" ? undefined : otherIncomeVat.trim(),
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      onLinked();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const amt = transactionAmountGrosze;
  const showIncome = amt > 0;
  const showCost = amt < 0;
  const showZeroHint = amt === 0;

  const scoreHint =
    "Współczynnik dopasowania (data, kwota, opis). Wyższa wartość = lepsza zgodność z transakcją.";

  const allowOtherIncomeOnMain = transactionAccountType === "MAIN";

  const incomeSection = (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">Faktury przychodu</h3>
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">Połącz + wpłata</strong> zapisuje{" "}
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">całą kwotę z wyciągu</strong> (
          {formatPlnFromGrosze(transactionAmountGrosze)}) na jedną fakturę — nie da się tą samą transakcją jednocześnie
          domknąć dwóch faktur. Przy wpłacie rozłożonej na kilka FV zrób osobne wpłaty w module przychodów lub podziel
          zapis w banku. W tabeli szukaj „pozostało brutto”: musi być ≥ kwota z wyciągu, inaczej przycisk jest wyłączony.
          Pola <strong className="font-medium text-zinc-700 dark:text-zinc-300">MAIN / VAT</strong> pokazują się tylko przy fakturze z{" "}
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">celem płatności VAT</strong>, pojedynczym projekcie
          i gdy pozostało brutto obejmuje całą kwotę z wyciągu — przy celu MAIN komunikat zamiast pól.
        </p>
        <label className="mb-2 block text-xs text-zinc-600 dark:text-zinc-400">
          <span className="mb-0.5 block font-medium text-zinc-700 dark:text-zinc-300">Szukaj na liście</span>
          <Input
            value={listFilter}
            onChange={(e) => setListFilter(e.target.value)}
            placeholder="Numer, kontrahent, kwota, tytuł planu…"
            className="!mt-1 !text-sm"
            disabled={busy}
          />
        </label>
        {incomes.length === 0 ? (
          <p className="text-xs text-zinc-500">Brak oczywistych dopasowań w oknie dat.</p>
        ) : filteredIncomes.length === 0 ? (
          <p className="text-xs text-zinc-500">Brak pozycji pasujących do filtra ({incomes.length} w bazie okna).</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {filteredIncomes.map((c) => (
              <li
                key={c.id}
                className="space-y-1 border-b border-zinc-100 py-2 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 text-zinc-700 dark:text-zinc-300">
                    {c.invoiceNumber} · {c.contractor} · {safeFormatDate(c.issueDate)} · brutto{" "}
                    {formatMoney(c.grossAmount)} · <span className="text-zinc-600 dark:text-zinc-400">pozostało</span>{" "}
                    {formatMoney(c.remainingGross)}
                    <span className="ml-1 text-xs text-zinc-400" title={scoreHint}>
                      (dopasowanie {c.score})
                    </span>
                    {!c.canFitFullPayment ? (
                      <span className="mt-0.5 block text-xs font-medium text-amber-800 dark:text-amber-200">
                        Cała kwota z wyciągu nie mieści się na tej fakturze.
                      </span>
                    ) : null}
                  </span>
                  <button
                    type="button"
                    disabled={busy || !c.canFitFullPayment || (c.vatDestination === "VAT" && c.splitBlocked)}
                    title={
                      !c.canFitFullPayment ?
                        `Pozostało ${c.remainingGross} PLN brutto, a z wyciągu ${formatPlnFromGrosze(transactionAmountGrosze)} — użyj innej faktury lub przychodów.`
                      : c.vatDestination === "VAT" && c.splitBlocked ?
                        "Faktura z wieloma projektami — użyj modułu przychodów."
                      : undefined
                    }
                    onClick={() => void linkIncome(c.id)}
                    className="shrink-0 rounded border border-emerald-600 px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                  >
                    Połącz + wpłata
                  </button>
                </div>
                {c.vatDestination !== "VAT" ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Cel płatności: <strong className="font-medium text-zinc-700 dark:text-zinc-300">MAIN</strong> — całe
                    brutto na konto główne; w tym kroku nie ma pól podziału MAIN/VAT (są tylko przy fakturach z celem VAT).
                  </p>
                ) : c.splitBlocked ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Jawny podział MAIN/VAT niedostępny (faktura z wieloma projektami) — użyj modułu przychodów.
                  </p>
                ) : !c.canFitFullPayment ? (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Pola MAIN/VAT pojawiłyby się tutaj, gdyby <strong className="font-medium text-zinc-700 dark:text-zinc-300">pozostało brutto</strong>{" "}
                    było ≥ kwota z wyciągu — przy częściowej kwocie najpierw zaksięguj wpłaty w module przychodów (bez
                    pełnego powiązania z tą linią banku) lub podziel zapis w imporcie.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-2 pl-0 text-xs">
                    <span className="text-zinc-500">Cashflow z tej wpłaty (suma = kwota z wyciągu):</span>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-zinc-500">MAIN (netto)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={incomeSplitDraft[c.id]?.main ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setIncomeSplitDraft((prev) => ({
                            ...prev,
                            [c.id]: { main: v, vat: prev[c.id]?.vat ?? "" },
                          }));
                        }}
                        className="w-28 rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono dark:border-zinc-600 dark:bg-zinc-950"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-zinc-500">VAT</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={incomeSplitDraft[c.id]?.vat ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setIncomeSplitDraft((prev) => ({
                            ...prev,
                            [c.id]: { main: prev[c.id]?.main ?? "", vat: v },
                          }));
                        }}
                        className="w-28 rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono dark:border-zinc-600 dark:bg-zinc-950"
                      />
                    </label>
                    <span className="pb-1 text-zinc-400">
                      = {formatPlnFromGrosze(transactionAmountGrosze)}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {allowOtherIncomeOnMain ?
        <div className="rounded border border-teal-200 bg-teal-50/60 p-3 dark:border-teal-900 dark:bg-teal-950/25">
          <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
            Bez faktury (np. zwrot podatku, wpłata własna): zapisz jako przychód pozafakturowy — wpływ w cashflow (MAIN + ewentualnie VAT).
            Kwota z wyciągu: {formatPlnFromGrosze(transactionAmountGrosze)}.
          </p>
          <label className="mb-2 block text-xs text-zinc-600 dark:text-zinc-400">
            <span className="mb-0.5 block font-medium text-zinc-700 dark:text-zinc-300">VAT (kwota, opcjonalnie)</span>
            <input
              type="text"
              inputMode="decimal"
              value={otherIncomeVat}
              onChange={(e) => setOtherIncomeVat(e.target.value)}
              placeholder="0"
              className="mt-0.5 w-full max-w-[200px] rounded border border-zinc-300 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-600 dark:bg-zinc-950"
            />
            <span className="mt-0.5 block text-zinc-500">Nie więcej niż kwota brutto z transakcji. Puste = całość na MAIN.</span>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void addOtherIncomeNoInvoice()}
            className="rounded border border-teal-700 bg-white px-3 py-1.5 text-xs font-medium text-teal-900 hover:bg-teal-50 disabled:opacity-50 dark:border-teal-600 dark:bg-zinc-950 dark:text-teal-100 dark:hover:bg-teal-950/40"
          >
            Dodaj jako przychód (bez faktury)
          </button>
        </div>
      : (
        <p className="text-xs text-zinc-500">
          Przychód bez faktury z importu jest dostępny tylko dla wierszy na koncie <strong className="font-medium">MAIN</strong>.
        </p>
      )}
    </div>
  );

  const costSection = (
    <div className="space-y-4">
      <label className="block text-xs text-zinc-600 dark:text-zinc-400">
        <span className="mb-0.5 block font-medium text-zinc-700 dark:text-zinc-300">Szukaj na liście</span>
        <Input
          value={listFilter}
          onChange={(e) => setListFilter(e.target.value)}
          placeholder="Numer faktury, dostawca, kwota, plan…"
          className="!mt-1 !text-sm"
          disabled={busy}
        />
      </label>
      <div>
        <h3 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">Faktury kosztowe</h3>
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Jedna transakcja z wyciągu = jedna płatność na pełną kwotę operacji. W liście: <strong className="font-medium text-zinc-700 dark:text-zinc-300">pozostało brutto</strong> musi pokryć kwotę z wyciągu.
        </p>
        {costs.length === 0 ? (
          <p className="text-xs text-zinc-500">Brak faktur kosztowych w oknie dat (±90 dni od operacji).</p>
        ) : filteredCosts.length === 0 ? (
          <p className="text-xs text-zinc-500">Brak faktur pasujących do filtra ({costs.length} w oknie).</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {filteredCosts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-1 dark:border-zinc-800">
                <span className="min-w-0 text-zinc-700 dark:text-zinc-300">
                  {c.documentNumber} · {c.supplier} · {safeFormatDate(c.documentDate)} · brutto {formatMoney(c.grossAmount)}{" "}
                  · pozostało {formatMoney(c.remainingGross)}
                  <span className="ml-1 text-xs text-zinc-400" title={scoreHint}>
                    (dopasowanie {c.score})
                  </span>
                  {!c.canFitFullPayment ? (
                    <span className="mt-0.5 block text-xs font-medium text-amber-800 dark:text-amber-200">
                      Cała kwota z wyciągu nie mieści się na tej fakturze.
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  disabled={busy || !c.canFitFullPayment}
                  title={
                    !c.canFitFullPayment ?
                      `Pozostało ${c.remainingGross} PLN, a z wyciągu ${formatPlnFromGrosze(transactionAmountGrosze)}.`
                    : undefined
                  }
                  onClick={() => void linkCost(c.id)}
                  className="shrink-0 rounded border border-emerald-600 px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                >
                  Połącz + płatność
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">Planowane koszty (nie faktury)</h3>
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Zdarzenia z modułu planu (status PLANNED).{" "}
          <strong className="font-medium text-zinc-600 dark:text-zinc-300">Utwórz koszt z wyciągu</strong> — powstanie
          dokument kosztowy z płatnością jak przy „Utwórz koszt”; jeśli kwota transakcji = suma planu (±0,02 zł), plan
          zostanie oznaczony jako skonwertowany. Przy innej kwocie plan zostaje otwarty (notatka na koszcie).
        </p>
        {plannedExpenses.length === 0 ? (
          <p className="text-xs text-zinc-500">Brak planowanych kosztów w oknie (±400 dni od daty operacji).</p>
        ) : filteredPlanned.length === 0 ? (
          <p className="text-xs text-zinc-500">Brak planów pasujących do filtra ({plannedExpenses.length} w oknie).</p>
        ) : (
          <ul className="max-h-36 space-y-1 overflow-y-auto text-sm">
            {filteredPlanned.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-1 dark:border-zinc-800"
              >
                <span className="text-zinc-700 dark:text-zinc-300">
                  {p.title} · {p.projectLabel}
                  {p.categoryName ? ` · ${p.categoryName}` : ""} · plan {safeFormatDate(p.plannedDate)} ·{" "}
                  {formatMoney(p.totalGross)} PLN
                  <span className="ml-1 text-xs text-zinc-400" title={scoreHint}>
                    (dopasowanie {p.score})
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createCostFromPlanned(p.id)}
                  className="shrink-0 rounded border border-sky-600 px-2 py-0.5 text-xs text-sky-900 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-600 dark:text-sky-100 dark:hover:bg-sky-950/40"
                >
                  Utwórz koszt z planu
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  const introHint =
    showIncome ?
      "Wpłata — wybierz fakturę przychodu, do której dopisujemy tę kwotę."
    :     showCost ?
      "Wydatek — wybierz fakturę kosztową albo planowany koszt (utworzenie dokumentu z wyciągu)."
    : "Kwota zerowa — brak podziału na przychód / koszt w tym widoku.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Dopasuj do istniejącego dokumentu</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Zamknij
          </button>
        </div>
        <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
          Po potwierdzeniu zostanie utworzony <strong className="font-medium">realny zapis płatności</strong> na fakturze (wpłata
          / wypłata) albo nowy koszt z wyciągu przy wyborze planu — zgodnie z kwotą i datą z wyciągu.
        </p>
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{introHint}</p>

        {error ? (
          <p className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-500">Ładowanie sugestii…</p>
        ) : (
          <div className="space-y-4">
            {showZeroHint ?
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Użyj statusów w tabeli importu lub szczegółów transakcji, jeśli ta pozycja nie wymaga dopasowania do faktury.
              </p>
            : showIncome ?
              incomeSection
            : costSection}
          </div>
        )}
      </div>
    </div>
  );
}
