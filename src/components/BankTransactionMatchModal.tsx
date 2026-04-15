"use client";

import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { formatPlnFromGrosze } from "@/lib/bank-import/format-pln";
import { formatMoney, safeFormatDate } from "@/lib/format";

type Suggestion = { id: string; score: number; grossAmount: string };

type CostS = Suggestion & { documentNumber: string; supplier: string; documentDate: string };
type IncS = Suggestion & { invoiceNumber: string; contractor: string; issueDate: string };

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
  const [busy, setBusy] = useState(false);
  /** Kwota VAT (PLN) dla przychodu bez faktury — puste = 0 */
  const [otherIncomeVat, setOtherIncomeVat] = useState("");

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
        suggestions: { costs: CostS[]; incomes: IncS[] };
      };
      setCosts(data.suggestions.costs ?? []);
      setIncomes(data.suggestions.incomes ?? []);
    } finally {
      setLoading(false);
    }
  }, [open, transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) setOtherIncomeVat("");
  }, [open]);

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
      const res = await fetch(`/api/bank-transactions/${transactionId}/link-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incomeInvoiceId: id }),
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
          Kwota brutto z dokumentu — saldo po wcześniejszych wpłatach sprawdzisz w module przychodów.
        </p>
        {incomes.length === 0 ? (
          <p className="text-xs text-zinc-500">Brak oczywistych dopasowań w oknie dat.</p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {incomes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-1 dark:border-zinc-800">
                <span className="text-zinc-700 dark:text-zinc-300">
                  {c.invoiceNumber} · {c.contractor} · {safeFormatDate(c.issueDate)} · brutto {formatMoney(c.grossAmount)}
                  <span className="ml-1 text-xs text-zinc-400" title={scoreHint}>
                    (dopasowanie {c.score})
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void linkIncome(c.id)}
                  className="shrink-0 rounded border border-emerald-600 px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                >
                  Połącz + wpłata
                </button>
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
    <div>
      <h3 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">Faktury kosztowe</h3>
      <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
        Kwota brutto z dokumentu — pozostało do zapłaty (po wcześniejszych przelewach) sprawdzisz w module kosztów.
      </p>
      {costs.length === 0 ? (
        <p className="text-xs text-zinc-500">Brak oczywistych dopasowań w oknie dat.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
          {costs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-1 dark:border-zinc-800">
              <span className="text-zinc-700 dark:text-zinc-300">
                {c.documentNumber} · {c.supplier} · {safeFormatDate(c.documentDate)} · brutto {formatMoney(c.grossAmount)}
                <span className="ml-1 text-xs text-zinc-400" title={scoreHint}>
                  (dopasowanie {c.score})
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
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
  );

  const introHint =
    showIncome ?
      "Wpłata — wybierz fakturę przychodu, do której dopisujemy tę kwotę."
    : showCost ?
      "Wydatek — wybierz fakturę kosztową, do której dopisujemy tę płatność."
    : "Kwota zerowa — brak podziału na przychód / koszt w tym widoku.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Dopasuj do dokumentu</h2>
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
          / wypłata), zgodny z kwotą i datą z wyciągu.
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
