"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { ProjectSearchPicker } from "@/components/ProjectSearchPicker";
import { readApiErrorBody } from "@/lib/api-client";
import {
  isExpenseCategoryBankFeesLike,
  looksLikeBankFeeDescription,
  suggestBankFeeCategoryId,
} from "@/lib/bank-import/bank-fee-heuristic";
import { inferDocumentNumberFromBankText } from "@/lib/bank-import/parse-document-number";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { decToNumber } from "@/lib/cashflow/money";

type ExpCat = { id: string; name: string; slug: string; isActive?: boolean };
type Proj = { id: string; name: string; isActive: boolean };

type TxPayload = {
  id: string;
  description: string;
  counterpartyName: string | null;
  bookingDate: string;
  amount: number;
  accountType: string;
  status: string;
};

type AllocRow = { projectId: string; grossAmount: string; description: string };

type Props = {
  transactionId: string | null;
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

function emptyAllocRows(tx: TxPayload | null): AllocRow[] {
  if (!tx) {
    return [
      { projectId: "", grossAmount: "", description: "" },
      { projectId: "", grossAmount: "", description: "" },
    ];
  }
  const halfPln = (Math.abs(tx.amount) / 2 / 100).toFixed(2);
  return [
    { projectId: "", grossAmount: halfPln, description: "" },
    { projectId: "", grossAmount: halfPln, description: "" },
  ];
}

export function CreateCostFromBankModal({ transactionId, open, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tx, setTx] = useState<TxPayload | null>(null);
  const [categories, setCategories] = useState<ExpCat[]>([]);
  const [projects, setProjects] = useState<Proj[]>([]);

  const [documentNumber, setDocumentNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [multiAlloc, setMultiAlloc] = useState(false);
  const [allocRows, setAllocRows] = useState<AllocRow[]>([
    { projectId: "", grossAmount: "", description: "" },
    { projectId: "", grossAmount: "", description: "" },
  ]);

  const reset = useCallback(() => {
    setErr(null);
    setTx(null);
    setDocumentNumber("");
    setSupplier("");
    setDescription("");
    setExpenseCategoryId("");
    setProjectId("");
    setMultiAlloc(false);
    setAllocRows([
      { projectId: "", grossAmount: "", description: "" },
      { projectId: "", grossAmount: "", description: "" },
    ]);
  }, []);

  useEffect(() => {
    if (!open || !transactionId) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const [rTx, rCat, rProj] = await Promise.all([
          fetch(`/api/bank-transactions/${transactionId}`),
          fetch("/api/expense-categories"),
          fetch("/api/projects"),
        ]);
        if (!rTx.ok) {
          const j = await rTx.json().catch(() => ({}));
          throw new Error(readApiErrorBody(j));
        }
        const txJson = (await rTx.json()) as TxPayload;
        if (cancelled) return;
        if (["VAT_TOPUP", "DUPLICATE", "IGNORED"].includes(txJson.status)) {
          setErr("Ten status nie pozwala na utworzenie kosztu.");
          setTx(null);
          return;
        }
        setTx(txJson);
        const inferred = inferDocumentNumberFromBankText(txJson.description);
        setDocumentNumber(inferred ?? `BANK-${txJson.id.slice(0, 12)}`);
        setSupplier(txJson.counterpartyName?.trim() ?? "");
        setDescription(txJson.description);
        setMultiAlloc(false);
        setAllocRows(emptyAllocRows(txJson));

        const cats = rCat.ok ? ((await rCat.json()) as ExpCat[]) : [];
        const projs = rProj.ok ? ((await rProj.json()) as Proj[]) : [];
        const catList = Array.isArray(cats) ? cats : [];
        if (!cancelled) {
          setCategories(catList);
          setProjects(Array.isArray(projs) ? projs : []);
          if (looksLikeBankFeeDescription(txJson.description)) {
            const sug = suggestBankFeeCategoryId(catList.filter((c) => c.isActive !== false));
            if (sug) setExpenseCategoryId(sug);
          }
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Błąd wczytywania");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  function handleClose() {
    if (saving) return;
    reset();
    onClose();
  }

  const targetGrossPln = tx ? Math.abs(tx.amount) / 100 : 0;

  const allocSumPln = useMemo(() => {
    let s = 0;
    for (const r of allocRows) {
      const g = r.grossAmount.trim();
      if (!g) continue;
      const n = decToNumber(normalizeDecimalInput(g));
      if (Number.isFinite(n)) s += n;
    }
    return Math.round(s * 100) / 100;
  }, [allocRows]);

  async function runCreate() {
    if (!transactionId || !tx) return;
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        documentNumber: documentNumber.trim() || null,
        supplier: supplier.trim() || null,
        description: description.trim() || null,
        expenseCategoryId: expenseCategoryId || null,
      };

      if (multiAlloc) {
        const valid = allocRows.filter((r) => r.projectId.trim() && r.grossAmount.trim());
        if (valid.length < 2) {
          setErr("Wybierz co najmniej dwa projekty i uzupełnij kwoty brutto w każdym wierszu.");
          setSaving(false);
          return;
        }
        if (Math.abs(allocSumPln - targetGrossPln) > 0.02) {
          setErr(
            `Suma brutto alokacji (${allocSumPln.toFixed(2)} PLN) musi równać kwocie z wyciągu (${targetGrossPln.toFixed(2)} PLN).`,
          );
          setSaving(false);
          return;
        }
        body.projectAllocations = valid.map((r) => {
          const g = normalizeDecimalInput(r.grossAmount);
          return {
            projectId: r.projectId.trim(),
            netAmount: g,
            grossAmount: g,
            description: r.description.trim(),
          };
        });
      } else {
        body.projectId = projectId || null;
      }

      const res = await fetch(`/api/bank-transactions/${transactionId}/create-cost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { costInvoice?: { id: string } };
      if (!res.ok) {
        setErr(readApiErrorBody(j));
        return;
      }
      onCreated();
      handleClose();
    } catch {
      setErr("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void runCreate();
  }

  const grossPln = tx ? (Math.abs(tx.amount) / 100).toFixed(2) : "—";

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === expenseCategoryId) ?? null,
    [categories, expenseCategoryId],
  );
  const bankFeeSupplierOptional =
    (selectedCategory && isExpenseCategoryBankFeesLike(selectedCategory)) || looksLikeBankFeeDescription(description);

  const categoriesForSelect = useMemo(() => {
    return categories.filter((c) => c.isActive !== false || c.id === expenseCategoryId);
  }, [categories, expenseCategoryId]);

  return (
    <Modal open={open} title="Utwórz koszt z transakcji bankowej" onClose={handleClose} size="lg">
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500">
          <Spinner className="!size-5" />
          Wczytywanie danych z banku…
        </div>
      ) : err && !tx ? (
        <Alert variant="error">{err}</Alert>
      ) : tx ? (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-zinc-500">
            Pola są wypełniane z opisu przelewu — możesz je poprawić przed zapisem. Kwota i VAT (0%) jak dotychczas przy
            kosztach z importu.
          </p>
          {err ? <Alert variant="error">{err}</Alert> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Numer dokumentu">
              <Input
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="np. FV/… lub numer z tytułu przelewu"
                disabled={saving}
                required
              />
            </Field>
            <Field
              label={
                bankFeeSupplierOptional ?
                  "Dostawca (opcjonalnie przy opłatach bankowych — zostaw puste, zapiszemy „Bank (opłata lub prowizja)”) "
                : "Dostawca"
              }
            >
              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                disabled={saving}
                required={!bankFeeSupplierOptional}
                placeholder={bankFeeSupplierOptional ? "np. nazwa dostawcy lub zostaw puste" : undefined}
              />
            </Field>
          </div>

          <Field label="Kategoria kosztu">
            <Select value={expenseCategoryId} onChange={(e) => setExpenseCategoryId(e.target.value)} disabled={saving}>
              <option value="">(opcjonalnie — jak w liście kosztów)</option>
              {categoriesForSelect.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isActive === false ? " (zarchiwizowana)" : ""}
                </option>
              ))}
            </Select>
          </Field>

          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300"
                checked={multiAlloc}
                disabled={saving}
                onChange={(e) => {
                  const on = e.target.checked;
                  setMultiAlloc(on);
                  if (on && tx) setAllocRows(emptyAllocRows(tx));
                }}
              />
              Alokacja na kilka projektów (suma netto i brutto = kwota z wyciągu)
            </label>
            {multiAlloc ? (
              <div className="mt-3 space-y-2">
                {allocRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    <Field label="Projekt">
                      <ProjectSearchPicker
                        value={row.projectId.trim() || null}
                        onChange={(id) =>
                          setAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, projectId: id ?? "" } : x)))
                        }
                        listSort="code"
                        disabled={saving}
                      />
                    </Field>
                    <Field label="Brutto (alokacja)">
                      <Input
                        value={row.grossAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, grossAmount: v } : x)));
                        }}
                        disabled={saving}
                        inputMode="decimal"
                      />
                    </Field>
                    <Field label="Notatka (opcjonalnie)">
                      <Input
                        value={row.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, description: v } : x)));
                        }}
                        disabled={saving}
                      />
                    </Field>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <span>
                    Suma brutto: <strong className="text-zinc-900 dark:text-zinc-100">{allocSumPln.toFixed(2)}</strong>{" "}
                    / {targetGrossPln.toFixed(2)} PLN
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-xs"
                    disabled={saving}
                    onClick={() => setAllocRows((rows) => [...rows, { projectId: "", grossAmount: "", description: "" }])}
                  >
                    + Wiersz
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <Field label="Projekt">
                  <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={saving}>
                    <option value="">(brak)</option>
                    {projects
                      .slice()
                      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "pl"))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                          {!p.isActive ? " (nieaktywny)" : ""}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>

          <Field label="Opis (pełny tekst z banku — możesz skrócić lub uzupełnić)">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} disabled={saving} />
          </Field>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900/50">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-zinc-600 dark:text-zinc-400">
              <span>
                Kwota brutto: <strong className="text-zinc-900 dark:text-zinc-100">{grossPln} PLN</strong>
              </span>
              <span>
                Konto: <strong>{tx.accountType}</strong>
              </span>
              <span>VAT: 0% (jak dotychczas przy kosztach z wyciągu)</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Spinner className="mr-2 !size-4" /> Zapisywanie…
                </>
              ) : (
                "Utwórz koszt i powiąż"
              )}
            </Button>
            <Button type="button" variant="secondary" onClick={handleClose} disabled={saving}>
              Anuluj
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            Przy zaznaczonej alokacji wieloprojektowej powstaje <strong className="font-medium">jeden</strong> dokument
            kosztowy i jedna płatność z importu — podział na projekty jak w formularzu faktury kosztowej (bez drugiej
            faktury).
          </p>
        </form>
      ) : null}
    </Modal>
  );
}
