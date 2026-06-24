"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Field, Input, Select, Spinner, Textarea } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { ProjectSearchPicker } from "@/components/ProjectSearchPicker";
import { ksefImportNotes } from "@/lib/ksef/ksef-import-marker";
import type { KsefDocumentDirection } from "@/lib/ksef/types";
import type { KsefImportCostBody, KsefImportRevenueBody } from "@/lib/validation/ksef-import-schemas";

type CategoryRow = { id: string; name: string };

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export type KsefImportFormProps = {
  direction: Extract<KsefDocumentDirection, "PURCHASE" | "SALE">;
  ksefId: string;
  defaultPlannedDate: string | null;
  invoiceGrossAmount?: string | null;
  amountToPay?: string | null;
  acting: boolean;
  focusSection?: boolean;
  onFocusHandled?: () => void;
  onSubmitCost: (body: KsefImportCostBody) => void;
  onSubmitRevenue: (body: KsefImportRevenueBody) => void;
};

export function KsefImportForm({
  direction,
  ksefId,
  defaultPlannedDate,
  invoiceGrossAmount,
  amountToPay,
  acting,
  focusSection = false,
  onFocusHandled,
  onSubmitCost,
  onSubmitRevenue,
}: KsefImportFormProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [incomeCategoryId, setIncomeCategoryId] = useState("");
  const [costStatus, setCostStatus] = useState<KsefImportCostBody["status"]>("DO_ZAPLATY");
  const [incomeStatus, setIncomeStatus] = useState<KsefImportRevenueBody["status"]>("WYSTAWIONA");
  const [paymentSource, setPaymentSource] = useState<KsefImportCostBody["paymentSource"]>("MAIN");
  const [vatDestination, setVatDestination] = useState<KsefImportRevenueBody["vatDestination"]>("MAIN");
  const [plannedDate, setPlannedDate] = useState(() => toDateInputValue(defaultPlannedDate));
  const [notes, setNotes] = useState(() => ksefImportNotes(ksefId));
  const [expenseCategories, setExpenseCategories] = useState<CategoryRow[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<CategoryRow[]>([]);
  const [listsLoading, setListsLoading] = useState(true);

  useEffect(() => {
    setPlannedDate(toDateInputValue(defaultPlannedDate));
    setNotes(ksefImportNotes(ksefId));
  }, [defaultPlannedDate, ksefId]);

  useEffect(() => {
    let cancelled = false;
    setListsLoading(true);
    (async () => {
      try {
        const fetches =
          direction === "PURCHASE"
            ? [fetch("/api/expense-categories")]
            : [fetch("/api/income-categories")];
        const responses = await Promise.all(fetches);
        const jsons = await Promise.all(responses.map((r) => r.json()));
        if (cancelled) return;
        if (direction === "PURCHASE") {
          setExpenseCategories(Array.isArray(jsons[0]) ? jsons[0] : []);
        } else {
          setIncomeCategories(Array.isArray(jsons[0]) ? jsons[0] : []);
        }
      } catch {
        if (!cancelled) {
          setExpenseCategories([]);
          setIncomeCategories([]);
        }
      } finally {
        if (!cancelled) setListsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [direction]);

  useEffect(() => {
    if (!focusSection || !sectionRef.current) return;
    const el = sectionRef.current;
    const t = window.setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      const firstField = el.querySelector<HTMLElement>("input, select, textarea, button");
      firstField?.focus({ preventScroll: true });
      onFocusHandled?.();
    }, 120);
    return () => window.clearTimeout(t);
  }, [focusSection, onFocusHandled]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const plannedIso = plannedDate ? `${plannedDate}T12:00:00.000Z` : undefined;
    if (direction === "PURCHASE") {
      onSubmitCost({
        projectId,
        expenseCategoryId: expenseCategoryId || null,
        status: costStatus,
        paymentSource,
        plannedPaymentDate: plannedIso,
        notes: notes.trim() || undefined,
      });
      return;
    }
    onSubmitRevenue({
      projectId,
      incomeCategoryId: incomeCategoryId || null,
      status: incomeStatus,
      vatDestination,
      plannedIncomeDate: plannedIso,
      notes: notes.trim() || undefined,
    });
  }

  const title = direction === "PURCHASE" ? "Import kosztu" : "Import przychodu";
  const submitLabel = direction === "PURCHASE" ? "Zapisz jako koszt" : "Zapisz jako przychód";
  const paymentMismatch =
    direction === "PURCHASE" &&
    amountToPay != null &&
    invoiceGrossAmount != null &&
    Math.abs(Number(amountToPay) - Number(invoiceGrossAmount)) > 0.02;

  return (
    <section
      ref={sectionRef}
      id="ksef-import-form"
      className="scroll-mt-4 space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20"
      aria-label={title}
    >
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
      <p className="text-xs text-zinc-600 dark:text-zinc-400">
        Kwoty, kontrahent i numer pochodzą z dokumentu KSeF. Uzupełnij pola poniżej i zapisz.
      </p>

      {paymentMismatch ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          Kwota faktury ({formatMoney(invoiceGrossAmount)}) różni się od kwoty do zapłaty (
          {formatMoney(amountToPay)}). Przy imporcie zapiszemy obie wartości — płatności i cashflow będą
          liczone od kwoty do zapłaty.
        </div>
      ) : null}

      {listsLoading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Spinner className="size-3" />
          Ładowanie list…
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-3">
        <Field label="Projekt (opcjonalnie)">
          <ProjectSearchPicker
            value={projectId}
            onChange={setProjectId}
            disabled={acting}
            includeInactive
            listSort="code"
            placeholder="Szukaj projektu…"
          />
        </Field>

        {direction === "PURCHASE" ? (
          <>
            <Field label="Kategoria kosztu (opcjonalnie)">
              <Select
                value={expenseCategoryId}
                onChange={(e) => setExpenseCategoryId(e.target.value)}
                disabled={acting || listsLoading}
              >
                <option value="">— brak —</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status faktury">
                <Select
                  value={costStatus ?? "DO_ZAPLATY"}
                  onChange={(e) => setCostStatus(e.target.value as KsefImportCostBody["status"])}
                  disabled={acting}
                >
                  <option value="PLANOWANA">Planowana</option>
                  <option value="DO_ZAPLATY">Do zapłaty</option>
                  <option value="PARTIALLY_PAID">Częściowo zapłacona</option>
                  <option value="ZAPLACONA">Zapłacona</option>
                </Select>
              </Field>
              <Field label="Źródło płatności">
                <Select
                  value={paymentSource ?? "MAIN"}
                  onChange={(e) =>
                    setPaymentSource(e.target.value as KsefImportCostBody["paymentSource"])
                  }
                  disabled={acting}
                >
                  <option value="MAIN">MAIN</option>
                  <option value="VAT">VAT</option>
                  <option value="VAT_THEN_MAIN">Najpierw VAT, reszta MAIN</option>
                </Select>
              </Field>
            </div>
            <Field label="Planowana data zapłaty">
              <Input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                disabled={acting}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Kategoria przychodu (opcjonalnie)">
              <Select
                value={incomeCategoryId}
                onChange={(e) => setIncomeCategoryId(e.target.value)}
                disabled={acting || listsLoading}
              >
                <option value="">— brak —</option>
                {incomeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Status faktury">
                <Select
                  value={incomeStatus ?? "WYSTAWIONA"}
                  onChange={(e) => setIncomeStatus(e.target.value as KsefImportRevenueBody["status"])}
                  disabled={acting}
                >
                  <option value="PLANOWANA">Planowana</option>
                  <option value="WYSTAWIONA">Wystawiona</option>
                  <option value="PARTIALLY_RECEIVED">Częściowo opłacona</option>
                  <option value="OPLACONA">Opłacona</option>
                </Select>
              </Field>
              <Field label="Konto VAT / wpływ">
                <Select
                  value={vatDestination ?? "MAIN"}
                  onChange={(e) =>
                    setVatDestination(e.target.value as KsefImportRevenueBody["vatDestination"])
                  }
                  disabled={acting}
                >
                  <option value="MAIN">MAIN</option>
                  <option value="VAT">VAT</option>
                </Select>
              </Field>
            </div>
            <Field label="Planowana data wpływu">
              <Input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                disabled={acting}
              />
            </Field>
          </>
        )}

        <Field label="Notatka">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            disabled={acting}
          />
        </Field>

        <Button type="submit" disabled={acting || listsLoading}>
          {acting ? "Zapisywanie…" : submitLabel}
        </Button>
      </form>
    </section>
  );
}
