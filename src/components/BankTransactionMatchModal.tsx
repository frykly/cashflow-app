"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { readApiError } from "@/lib/api-client";
import { formatPlnFromGrosze } from "@/lib/bank-import/format-pln";
import { formatMoney, safeFormatDate } from "@/lib/format";
import { round2 } from "@/lib/cashflow/money";
import { PAY_EPS } from "@/lib/cashflow/settlement";
import { Input } from "@/components/ui";
import { CreateCostFromBankModal } from "@/components/CreateCostFromBankModal";

function parsePlnInput(raw: string | undefined): number {
  if (raw == null || !String(raw).trim()) return NaN;
  const n = Number(String(raw).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

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
  /** Kwota brutto wpłaty z tej linii banku na daną fakturę (PLN) */
  const [incomeAmountDraft, setIncomeAmountDraft] = useState<Record<string, string>>({});
  const [incomeTxMeta, setIncomeTxMeta] = useState<{ allocated: string; remaining: string } | null>(null);
  const [costTxMeta, setCostTxMeta] = useState<{ allocated: string; remaining: string } | null>(null);
  const [costAmountDraft, setCostAmountDraft] = useState<Record<string, string>>({});
  const [createCostFromBankOpen, setCreateCostFromBankOpen] = useState(false);
  /** Różnica kwoty plan vs bank — wybór ADJUST / PARTIAL / anuluj */
  const [plannedAmountResolution, setPlannedAmountResolution] = useState<PlannedE | null>(null);

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
        transaction: {
          amount: number;
          incomeAllocatedPln?: string;
          incomeRemainingPln?: string;
          costAllocatedPln?: string;
          costRemainingPln?: string;
        };
        suggestions: { costs: CostS[]; incomes: IncS[]; plannedExpenses?: PlannedE[] };
      };
      const suggestions = data.suggestions ?? { costs: [], incomes: [] };
      setCosts(suggestions.costs ?? []);
      const incList = suggestions.incomes ?? [];
      setIncomes(incList);
      setPlannedExpenses(suggestions.plannedExpenses ?? []);

      const tr = data.transaction;
      const costList = suggestions.costs ?? [];
      if (tr.amount > 0) {
        const br = Number(tr.incomeRemainingPln ?? Math.abs(tr.amount) / 100);
        setIncomeTxMeta({
          allocated: tr.incomeAllocatedPln ?? "0.00",
          remaining: tr.incomeRemainingPln ?? (Math.abs(tr.amount) / 100).toFixed(2),
        });
        const amounts: Record<string, string> = {};
        const splits: Record<string, { main: string; vat: string }> = {};
        for (const row of incList) {
          const ir = Number(row.remainingGross);
          const cap = round2(Math.min(ir, br));
          if (cap > PAY_EPS) {
            amounts[row.id] = cap.toFixed(2);
            if (row.vatDestination === "VAT" && !row.splitBlocked && row.canFitFullPayment) {
              splits[row.id] = defaultBankIncomeSplit(row, cap);
            }
          }
        }
        setIncomeAmountDraft(amounts);
        setIncomeSplitDraft(splits);
        setCostTxMeta(null);
        setCostAmountDraft({});
      } else if (tr.amount < 0) {
        setIncomeTxMeta(null);
        setIncomeAmountDraft({});
        setIncomeSplitDraft({});
        const br = Number(tr.costRemainingPln ?? Math.abs(tr.amount) / 100);
        setCostTxMeta({
          allocated: tr.costAllocatedPln ?? "0.00",
          remaining: tr.costRemainingPln ?? (Math.abs(tr.amount) / 100).toFixed(2),
        });
        const costAmounts: Record<string, string> = {};
        for (const row of costList) {
          const ir = Number(row.remainingGross);
          const cap = round2(Math.min(ir, br));
          if (cap > PAY_EPS) costAmounts[row.id] = cap.toFixed(2);
        }
        setCostAmountDraft(costAmounts);
      } else {
        setIncomeTxMeta(null);
        setIncomeAmountDraft({});
        setIncomeSplitDraft({});
        setCostTxMeta(null);
        setCostAmountDraft({});
      }
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
      setIncomeAmountDraft({});
      setIncomeTxMeta(null);
      setCostTxMeta(null);
      setCostAmountDraft({});
      setCreateCostFromBankOpen(false);
      setPlannedAmountResolution(null);
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

  async function linkCost(id: string) {
    setBusy(true);
    setError(null);
    try {
      const inv = costs.find((r) => r.id === id);
      const bankRem =
        costTxMeta != null ? Number(costTxMeta.remaining) : Math.abs(transactionAmountGrosze) / 100;
      const draft = costAmountDraft[id]?.trim();
      const parsed = parsePlnInput(draft);
      const chunk =
        Number.isFinite(parsed) ? parsed : round2(Math.min(Number(inv?.remainingGross ?? 0), bankRem));
      const res = await fetch(`/api/bank-transactions/${transactionId}/link-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costInvoiceId: id, paymentGross: chunk.toFixed(2) }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      onLinked();
      let remAfter = Number.POSITIVE_INFINITY;
      const r2 = await fetch(`/api/bank-transactions/${transactionId}/match-suggestions`);
      if (r2.ok) {
        const d2 = (await r2.json()) as { transaction: { costRemainingPln?: string } };
        remAfter = Number(d2.transaction?.costRemainingPln ?? 0);
      }
      await load();
      if (remAfter <= PAY_EPS) onClose();
    } finally {
      setBusy(false);
    }
  }

  async function linkIncome(id: string) {
    setBusy(true);
    setError(null);
    try {
      const inv = incomes.find((r) => r.id === id);
      const bankRem =
        incomeTxMeta != null ? Number(incomeTxMeta.remaining) : Math.abs(transactionAmountGrosze) / 100;
      const draft = incomeAmountDraft[id]?.trim();
      const parsed = parsePlnInput(draft);
      const chunk =
        Number.isFinite(parsed) ? parsed : round2(Math.min(Number(inv?.remainingGross ?? 0), bankRem));
      const body: Record<string, unknown> = { incomeInvoiceId: id, paymentGross: chunk.toFixed(2) };
      if (inv?.vatDestination === "VAT" && !inv.splitBlocked && chunk > PAY_EPS) {
        const d = incomeSplitDraft[id] ?? defaultBankIncomeSplit(inv, chunk);
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
      let remAfter = Number.POSITIVE_INFINITY;
      const r2 = await fetch(`/api/bank-transactions/${transactionId}/match-suggestions`);
      if (r2.ok) {
        const d2 = (await r2.json()) as { transaction: { incomeRemainingPln?: string } };
        remAfter = Number(d2.transaction?.incomeRemainingPln ?? 0);
      }
      await load();
      if (remAfter <= PAY_EPS) onClose();
    } finally {
      setBusy(false);
    }
  }

  function plannedVsBankGroszeDiff(p: PlannedE): number {
    const plannedPln = round2(Number(String(p.totalGross).replace(/\s/g, "").replace(",", ".")));
    const bankPln = round2(costBankRemainingPln);
    const planG = Math.round(plannedPln * 100);
    const bankG = Math.round(bankPln * 100);
    return planG - bankG;
  }

  async function createCostFromPlanned(
    plannedEventId: string,
    plannedResolution?: "ADJUST_AND_CLOSE" | "PARTIAL_LEAVE_OPEN",
  ) {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { plannedEventId };
      if (plannedResolution) body.plannedResolution = plannedResolution;
      const res = await fetch(`/api/bank-transactions/${transactionId}/create-cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      setPlannedAmountResolution(null);
      onLinked();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function onClickCreateCostFromPlanned(p: PlannedE) {
    const diffG = plannedVsBankGroszeDiff(p);
    if (Math.abs(diffG) <= 2) {
      void createCostFromPlanned(p.id);
      return;
    }
    setPlannedAmountResolution(p);
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

  const bankRemainingPln =
    incomeTxMeta != null ? Number(incomeTxMeta.remaining) : Math.abs(transactionAmountGrosze) / 100;
  const bankTotalPln = Math.abs(transactionAmountGrosze) / 100;
  const costBankRemainingPln =
    costTxMeta != null ? Number(costTxMeta.remaining) : Math.abs(transactionAmountGrosze) / 100;

  const incomeSection = (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">Faktury przychodu</h3>
        {incomeTxMeta ? (
          <p className="mb-2 rounded border border-cyan-200 bg-cyan-50/70 px-2 py-1.5 text-xs text-cyan-950 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100">
            Kwota z wyciągu: <strong>{bankTotalPln.toFixed(2)} PLN</strong> · już na faktury:{" "}
            <strong>{incomeTxMeta.allocated} PLN</strong> · <strong>pozostało: {incomeTxMeta.remaining} PLN</strong>
          </p>
        ) : null}
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">Połącz + wpłata</strong> zapisuje wpłatę z{" "}
          <strong className="font-medium text-zinc-700 dark:text-zinc-300">tej linii banku</strong> na wybraną fakturę.
          Domyślnie bierze minimum z („pozostało” na fakturze) i („pozostało” na transakcji); możesz wpisać mniejszą kwotę
          i ponownie otworzyć dopasowanie, aby przypisać resztę do innej faktury. Suma wpłat z tej linii nie może przekroczyć
          kwoty z wyciągu. Pola <strong className="font-medium text-zinc-700 dark:text-zinc-300">MAIN / VAT</strong> tylko przy
          fakturze VAT i jednym projekcie — suma MAIN+VAT = wpisana kwota brutto wpłaty.
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
        ) : bankRemainingPln <= PAY_EPS ? (
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
            Cała kwota z tej linii banku jest już rozdzielona na faktury przychodu. Zamknij okno lub użyj „Cofnij” przy
            transakcji, aby zmienić przypisanie.
          </p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {filteredIncomes.map((c) => {
              const invRem = Number(c.remainingGross);
              const rowParsed = parsePlnInput(incomeAmountDraft[c.id]);
              const chunk = Number.isFinite(rowParsed)
                ? rowParsed
                : round2(Math.min(invRem, bankRemainingPln));
              const lineOk =
                chunk > PAY_EPS &&
                chunk <= bankRemainingPln + PAY_EPS &&
                chunk <= invRem + PAY_EPS &&
                !(c.vatDestination === "VAT" && c.splitBlocked);
              const showSplit =
                c.vatDestination === "VAT" &&
                !c.splitBlocked &&
                chunk > PAY_EPS &&
                chunk <= invRem + PAY_EPS &&
                chunk <= bankRemainingPln + PAY_EPS;
              return (
                <li key={c.id} className="space-y-1 border-b border-zinc-100 py-2 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-zinc-700 dark:text-zinc-300">
                      {c.invoiceNumber} · {c.contractor} · {safeFormatDate(c.issueDate)} · brutto{" "}
                      {formatMoney(c.grossAmount)} · <span className="text-zinc-600 dark:text-zinc-400">pozostało</span>{" "}
                      {formatMoney(c.remainingGross)}
                      <span className="ml-1 text-xs text-zinc-400" title={scoreHint}>
                        (dopasowanie {c.score})
                      </span>
                      {bankRemainingPln > invRem + PAY_EPS ? (
                        <span className="mt-0.5 block text-xs font-medium text-amber-800 dark:text-amber-200">
                          Linia banku jest większa niż pozostało na tej fakturze — domyślnie wpłynie tylko część (pole
                          „Kwota wpłaty”).
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      disabled={busy || !lineOk}
                      title={
                        !lineOk ?
                          bankRemainingPln <= PAY_EPS ?
                            "Brak kwoty do przypisania na tej linii banku."
                          : c.vatDestination === "VAT" && c.splitBlocked ?
                            "Faktura z wieloma projektami — użyj modułu przychodów."
                          : "Sprawdź kwotę: > 0, ≤ pozostało na fakturze i ≤ pozostało na transakcji."
                        : undefined
                      }
                      onClick={() => void linkIncome(c.id)}
                      className="shrink-0 rounded border border-emerald-600 px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                    >
                      Połącz + wpłata
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-zinc-500">Kwota wpłaty (brutto z tej linii)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={incomeAmountDraft[c.id] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setIncomeAmountDraft((prev) => ({ ...prev, [c.id]: v }));
                          const p = parsePlnInput(v);
                          const ch = Number.isFinite(p) ? p : 0;
                          const cap = round2(Math.min(ch, invRem, bankRemainingPln));
                          if (c.vatDestination === "VAT" && !c.splitBlocked && cap > PAY_EPS) {
                            setIncomeSplitDraft((prev) => ({
                              ...prev,
                              [c.id]: defaultBankIncomeSplit(c, cap),
                            }));
                          }
                        }}
                        className="w-32 rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono dark:border-zinc-600 dark:bg-zinc-950"
                      />
                    </label>
                    <span className="text-zinc-400">PLN</span>
                  </div>
                  {c.vatDestination !== "VAT" ? (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Cel płatności: <strong className="font-medium text-zinc-700 dark:text-zinc-300">MAIN</strong> — brutto
                      na konto główne; brak podziału MAIN/VAT w tym kroku.
                    </p>
                  ) : c.splitBlocked ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Jawny podział MAIN/VAT niedostępny (faktura z wieloma projektami) — użyj modułu przychodów.
                    </p>
                  ) : showSplit ? (
                    <div className="flex flex-wrap items-end gap-2 pl-0 text-xs">
                      <span className="text-zinc-500">Cashflow z tej wpłaty (MAIN + VAT = kwota powyżej):</span>
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
                      <span className="pb-1 text-zinc-400">= {chunk.toFixed(2)} PLN</span>
                    </div>
                  ) : null}
                </li>
              );
            })}
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
        {costTxMeta ? (
          <p className="mb-2 rounded border border-blue-200 bg-blue-50/70 px-2 py-1.5 text-xs text-blue-950 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
            Kwota z wyciągu: <strong>{bankTotalPln.toFixed(2)} PLN</strong> · już na faktury kosztowe:{" "}
            <strong>{costTxMeta.allocated} PLN</strong> · <strong>pozostało: {costTxMeta.remaining} PLN</strong>
          </p>
        ) : null}
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Płatność z tej linii banku na fakturę kosztową. Domyślnie: minimum z („pozostało” na fakturze) i („pozostało” na
          transakcji). Możesz wpisać mniejszą kwotę i przypisać resztę do kolejnej faktury. Suma płatności z tej linii nie
          może przekroczyć kwoty z wyciągu.
        </p>
        {costs.length === 0 ? (
          <p className="text-xs text-zinc-500">Brak faktur kosztowych w oknie dat (±90 dni od operacji).</p>
        ) : filteredCosts.length === 0 ? (
          <p className="text-xs text-zinc-500">Brak faktur pasujących do filtra ({costs.length} w oknie).</p>
        ) : costBankRemainingPln <= PAY_EPS ? (
          <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
            Cała kwota z tej linii banku jest już rozdzielona na faktury kosztowe. Zamknij okno lub użyj „Cofnij” przy
            transakcji.
          </p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
            {filteredCosts.map((c) => {
              const invRem = Number(c.remainingGross);
              const rowParsed = parsePlnInput(costAmountDraft[c.id]);
              const chunk = Number.isFinite(rowParsed)
                ? rowParsed
                : round2(Math.min(invRem, costBankRemainingPln));
              const lineOk =
                chunk > PAY_EPS &&
                chunk <= costBankRemainingPln + PAY_EPS &&
                chunk <= invRem + PAY_EPS;
              return (
                <li key={c.id} className="space-y-1 border-b border-zinc-100 py-2 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-zinc-700 dark:text-zinc-300">
                      {c.documentNumber} · {c.supplier} · {safeFormatDate(c.documentDate)} · brutto{" "}
                      {formatMoney(c.grossAmount)} · pozostało {formatMoney(c.remainingGross)}
                      <span className="ml-1 text-xs text-zinc-400" title={scoreHint}>
                        (dopasowanie {c.score})
                      </span>
                      {costBankRemainingPln > invRem + PAY_EPS ? (
                        <span className="mt-0.5 block text-xs font-medium text-amber-800 dark:text-amber-200">
                          Linia banku jest większa niż pozostało na tej fakturze — domyślnie zapłaci się tylko część (pole
                          „Kwota płatności”).
                        </span>
                      ) : null}
                    </span>
                    <button
                      type="button"
                      disabled={busy || !lineOk}
                      title={
                        !lineOk ?
                          costBankRemainingPln <= PAY_EPS ?
                            "Brak kwoty do przypisania na tej linii banku."
                          : "Sprawdź kwotę: &gt; 0, ≤ pozostało na fakturze i ≤ pozostało na transakcji."
                        : undefined
                      }
                      onClick={() => void linkCost(c.id)}
                      className="shrink-0 rounded border border-emerald-600 px-2 py-0.5 text-xs text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                    >
                      Połącz + płatność
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-zinc-500">Kwota płatności (brutto z tej linii)</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={costAmountDraft[c.id] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCostAmountDraft((prev) => ({ ...prev, [c.id]: v }));
                        }}
                        className="w-32 rounded border border-zinc-300 bg-white px-1.5 py-0.5 font-mono dark:border-zinc-600 dark:bg-zinc-950"
                      />
                    </label>
                    <span className="text-zinc-400">PLN</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {costBankRemainingPln > PAY_EPS ? (
        <div className="rounded-lg border border-violet-200 bg-violet-50/80 p-3 dark:border-violet-900 dark:bg-violet-950/30">
          <p className="mb-2 text-xs text-violet-950 dark:text-violet-100">
            Reszta kwoty nie pasuje do faktury ani nie masz pasującego planu (np. tankowanie)? Utwórz{" "}
            <strong>nowy dokument kosztowy</strong> na pozostałe{" "}
            <strong>{costTxMeta?.remaining ?? costBankRemainingPln.toFixed(2)} PLN</strong> — ta sama linia banku, osobna
            faktura kosztowa z płatnością z wyciągu.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => setCreateCostFromBankOpen(true)}
            className="rounded border border-violet-700 bg-white px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-600 dark:bg-zinc-950 dark:text-violet-100 dark:hover:bg-violet-950/40"
          >
            Utwórz nowy koszt (pozostała kwota)
          </button>
        </div>
      ) : null}
      <div>
        <h3 className="mb-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">Planowane koszty (nie faktury)</h3>
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
          Zdarzenia z modułu planu (status PLANNED).{" "}
          <strong className="font-medium text-zinc-600 dark:text-zinc-300">Utwórz koszt z wyciągu</strong> — dokument kosztowy
          z płatnością z wyciągu. Gdy kwota z banku = suma planu (±0,02 zł), plan zostanie oznaczony jako skonwertowany. Gdy
          kwoty się różnią, wybierzesz: dopasować plan do rzeczywistej płatności i zamknąć, albo potraktować jako częściową
          płatność (niedopłata zostaje w planie).
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
                  onClick={() => onClickCreateCostFromPlanned(p)}
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

  const plannedRes = plannedAmountResolution;
  const plannedResDiffG = plannedRes ? plannedVsBankGroszeDiff(plannedRes) : 0;
  const canChoosePartial = plannedResDiffG > 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
      {plannedRes ?
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="planned-resolution-title"
        >
          <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-600 dark:bg-zinc-900">
            <h3 id="planned-resolution-title" className="mb-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              Różnica kwoty: plan vs bank
            </h3>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-300">
              <span className="font-medium">{plannedRes.title}</span>
              <br />
              Plan (brutto): {plannedRes.totalGross} PLN · Kwota z tej linii banku:{" "}
              {costBankRemainingPln.toFixed(2)} PLN
              <br />
              {plannedResDiffG > 0 ?
                <>W planie zostaje do rozliczenia: {(plannedResDiffG / 100).toFixed(2)} PLN.</>
              : plannedResDiffG < 0 ?
                <>Płatność z banku wyższa niż plan o {(-plannedResDiffG / 100).toFixed(2)} PLN.</>
              : null}
            </p>
            <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
              Wybierz, jak potraktować tę operację — system nie zgaduje automatycznie.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void createCostFromPlanned(plannedRes.id, "ADJUST_AND_CLOSE")}
                className="rounded border border-emerald-600 bg-emerald-50 px-3 py-2 text-left text-sm text-emerald-950 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
              >
                <strong className="block">Pełna płatność (dopasuj plan do banku)</strong>
                <span className="text-xs opacity-90">
                  Zaktualizuj kwoty planu do rzeczywistej płatności, oznacz plan jako rozliczony — bez niedopłaty.
                </span>
              </button>
              {canChoosePartial ?
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void createCostFromPlanned(plannedRes.id, "PARTIAL_LEAVE_OPEN")}
                  className="rounded border border-amber-600 bg-amber-50 px-3 py-2 text-left text-sm text-amber-950 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60"
                >
                  <strong className="block">Częściowa płatność</strong>
                  <span className="text-xs opacity-90">
                    Powiąż tę kwotę z planem; pozostała część zostaje w planie jako niedopłata (status otwarty).
                  </span>
                </button>
              : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => setPlannedAmountResolution(null)}
                className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Anuluj — bez zmian
              </button>
            </div>
          </div>
        </div>
      : null}
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
      <CreateCostFromBankModal
        transactionId={createCostFromBankOpen ? transactionId : null}
        open={createCostFromBankOpen}
        onClose={() => setCreateCostFromBankOpen(false)}
        onCreated={() => {
          setCreateCostFromBankOpen(false);
          onLinked();
          void load();
        }}
      />
    </div>
  );
}
