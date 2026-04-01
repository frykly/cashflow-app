"use client";

import { useCallback, useEffect, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { safeFormatDate } from "@/lib/format";

type Suggestion = { id: string; score: number; grossAmount: string };

type CostS = Suggestion & { documentNumber: string; supplier: string; documentDate: string };
type IncS = Suggestion & { invoiceNumber: string; contractor: string; issueDate: string };

type Props = {
  transactionId: string;
  open: boolean;
  onClose: () => void;
  onLinked: () => void;
};

export function BankTransactionMatchModal({ transactionId, open, onClose, onLinked }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [costs, setCosts] = useState<CostS[]>([]);
  const [incomes, setIncomes] = useState<IncS[]>([]);
  const [preferPrimaryDocument, setPreferPrimaryDocument] = useState<"income" | "cost">("income");
  const [manualCost, setManualCost] = useState("");
  const [manualIncome, setManualIncome] = useState("");
  const [busy, setBusy] = useState(false);

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
        suggestions: { costs: CostS[]; incomes: IncS[]; preferPrimaryDocument?: "income" | "cost" };
      };
      setCosts(data.suggestions.costs ?? []);
      setIncomes(data.suggestions.incomes ?? []);
      if (data.suggestions.preferPrimaryDocument) {
        setPreferPrimaryDocument(data.suggestions.preferPrimaryDocument);
      }
    } finally {
      setLoading(false);
    }
  }, [open, transactionId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function linkManual() {
    const c = manualCost.trim();
    const i = manualIncome.trim();
    if (!c && !i) {
      setError("Wklej identyfikator faktury kosztowej lub przychodu.");
      return;
    }
    if (c && i) {
      setError("Podaj tylko jeden identyfikator.");
      return;
    }
    if (c) await linkCost(c);
    else if (i) await linkIncome(i);
  }

  if (!open) return null;

  const hint =
    preferPrimaryDocument === "income" ?
      "Kwota dodatnia: najpierw sugerujemy przychody; ujemna transakcja → koszty."
    : "Kwota ujemna: najpierw sugerujemy koszty; dodatnia transakcja → przychody.";

  const incomeSection = (
    <div>
      <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Faktury przychodu</h3>
      {incomes.length === 0 ? (
        <p className="text-xs text-zinc-500">Brak oczywistych dopasowań w oknie dat.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
          {incomes.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-1 dark:border-zinc-800">
              <span className="text-zinc-700 dark:text-zinc-300">
                {c.invoiceNumber} · {c.contractor} · {safeFormatDate(c.issueDate)} · {c.grossAmount} PLN
                <span className="ml-1 text-xs text-zinc-400">({c.score})</span>
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
  );

  const costSection = (
    <div>
      <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Faktury kosztowe</h3>
      {costs.length === 0 ? (
        <p className="text-xs text-zinc-500">Brak oczywistych dopasowań w oknie dat.</p>
      ) : (
        <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
          {costs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 py-1 dark:border-zinc-800">
              <span className="text-zinc-700 dark:text-zinc-300">
                {c.documentNumber} · {c.supplier} · {safeFormatDate(c.documentDate)} · {c.grossAmount} PLN
                <span className="ml-1 text-xs text-zinc-400">({c.score})</span>
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
        <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>

        {error ? (
          <p className="mb-3 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="text-sm text-zinc-500">Ładowanie sugestii…</p>
        ) : (
          <div className="space-y-4">
            {preferPrimaryDocument === "income" ?
              <>
                {incomeSection}
                {costSection}
              </>
            : <>
                {costSection}
                {incomeSection}
              </>
            }
            <div className="rounded border border-zinc-200 p-3 dark:border-zinc-700">
              <h3 className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">Ręcznie (ID z systemu)</h3>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex-1 text-xs">
                  <span className="text-zinc-500">Koszt (cuid)</span>
                  <input
                    value={manualCost}
                    onChange={(e) => {
                      setManualCost(e.target.value);
                      setManualIncome("");
                    }}
                    className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    placeholder="tylko przy kwocie ujemnej"
                  />
                </label>
                <label className="flex-1 text-xs">
                  <span className="text-zinc-500">Przychód (cuid)</span>
                  <input
                    value={manualIncome}
                    onChange={(e) => {
                      setManualIncome(e.target.value);
                      setManualCost("");
                    }}
                    className="mt-0.5 w-full rounded border border-zinc-300 px-2 py-1 font-mono text-xs dark:border-zinc-600 dark:bg-zinc-950"
                    placeholder="tylko przy kwocie dodatniej"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void linkManual()}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
                >
                  Połącz
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
