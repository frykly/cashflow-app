"use client";

import Link from "next/link";
import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { ProjectSearchPicker } from "@/components/ProjectSearchPicker";
import { Alert, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { amountsFromGrossRate, amountsFromNetRate, inferVatRateFromAmounts, type VatRatePct } from "@/lib/vat-rate";
import { InvoiceAmountFields, type AmountEntryMode } from "@/components/InvoiceAmountFields";
import { ContractorAutocomplete } from "@/components/ContractorAutocomplete";
import type { IncomeInvoice, IncomeInvoicePayment } from "@prisma/client";
import { round2 } from "@/lib/cashflow/money";
import { incomeRemainingGross, PAY_EPS, sumIncomePaymentsGross } from "@/lib/cashflow/settlement";
import { DueDateOffsetControls } from "@/components/DueDateOffsetControls";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { InvoicePdfDraftSection } from "@/components/InvoicePdfDraftSection";
import type { InvoicePdfDraftResponse } from "@/lib/invoice-pdf/types";
import { readApiErrorBody } from "@/lib/api-client";
import { documentGrossSlicesFromInvoice } from "@/lib/payment-project-allocation/distribute-read";
import { defaultProportionalPaymentAllocationRows } from "@/lib/payment-project-allocation/default-rows";

type PayPick = Pick<IncomeInvoicePayment, "amountGross">;

type Cat = { id: string; name: string; slug: string };
type ProjectOption = { id: string; name: string; isActive: boolean; code?: string | null };

type DraftLike = {
  id?: string;
  invoiceNumber: string;
  contractor: string;
  description: string;
  vatRate: number;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  issueDate?: string | null;
  paymentDueDate?: string | null;
  plannedIncomeDate?: string | null;
  status: string;
  vatDestination: string;
  confirmedIncome: boolean;
  actualIncomeDate: string | null;
  notes: string;
  incomeCategoryId?: string | null;
  payments?: {
    id: string;
    amountGross: string;
    paymentDate: string;
    notes: string;
    allocatedMainAmount?: string | null;
    allocatedVatAmount?: string | null;
  }[];
  isGeneratedFromRecurring?: boolean;
  isRecurringDetached?: boolean;
  projectId?: string | null;
  projectName?: string | null;
  projectAllocations?: {
    id: string;
    projectId: string;
    netAmount: unknown;
    grossAmount: unknown;
    description: string;
    project?: { id: string; name: string } | null;
  }[];
  plannedPayments?: {
    id?: string;
    clientKey?: string;
    dueDate: string;
    plannedMainAmount: string;
    plannedVatAmount: string;
    note: string;
    sortOrder: number;
    status: string;
  }[];
};

type ProjectAllocRow = { projectId: string; netAmount: string; grossAmount: string; description: string };
type PayProjectRow = { projectId: string; grossAmount: string };
type PayDraft = { amountGross: string; paymentDate: string; notes: string };

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function projectDescription(projectName?: string | null, projectCode?: string | null): string {
  const parts = [
    projectName?.trim() ? `Projekt: ${projectName.trim()}` : "",
    projectCode?.trim() ? `Numer zlecenia: ${projectCode.trim()}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function createEmptyIncomeDraft(
  contractor = "",
  projectId: string | null = null,
  projectName?: string | null,
  projectCode?: string | null,
): DraftLike {
  const { vatAmount, grossAmount } = amountsFromNetRate("0", 23);
  return {
    invoiceNumber: "",
    contractor,
    description: projectDescription(projectName, projectCode),
    vatRate: 23,
    netAmount: "0",
    vatAmount,
    grossAmount,
    issueDate: todayYmd(),
    paymentDueDate: todayYmd(),
    plannedIncomeDate: todayYmd(),
    status: "PLANOWANA",
    vatDestination: "MAIN",
    confirmedIncome: false,
    actualIncomeDate: null,
    notes: "",
    incomeCategoryId: null,
    projectId,
    plannedPayments: [],
  };
}

function newPlanRow(sortOrder: number): NonNullable<DraftLike["plannedPayments"]>[number] {
  const ck =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `ck-${sortOrder}-${Date.now()}`;
  return {
    clientKey: ck,
    dueDate: todayYmd(),
    plannedMainAmount: "0",
    plannedVatAmount: "0",
    note: "",
    sortOrder,
    status: "PLANNED",
  };
}

function incomeInvoiceMultiProject(editing: Pick<DraftLike, "projectAllocations" | "projectId">): boolean {
  return (editing.projectAllocations?.length ?? 0) > 1;
}

function normalizePlannedFromApi(raw: DraftLike["plannedPayments"] | undefined): NonNullable<DraftLike["plannedPayments"]> {
  if (!raw?.length) return [];
  return [...raw]
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({
      id: p.id,
      clientKey: p.clientKey,
      dueDate: isoToDateInputValue(typeof p.dueDate === "string" ? p.dueDate : String(p.dueDate)),
      plannedMainAmount: String(p.plannedMainAmount ?? "0"),
      plannedVatAmount: String(p.plannedVatAmount ?? "0"),
      note: p.note ?? "",
      sortOrder: p.sortOrder ?? 0,
      status: p.status ?? "PLANNED",
    }));
}

function prefillIncomePaymentCashflowSplit(editing: DraftLike, grossStr: string): { main: string; vat: string } {
  if (editing.vatDestination !== "VAT" || incomeInvoiceMultiProject(editing)) {
    return { main: "", vat: "" };
  }
  const gInv = Number(editing.grossAmount);
  const pay = Number(normalizeDecimalInput(grossStr));
  if (!(gInv > 0) || !Number.isFinite(pay)) return { main: "0.00", vat: "0.00" };
  const vat = Number(editing.vatAmount);
  const ratio = pay / gInv;
  const vPart = round2(vat * ratio);
  const mPart = round2(pay - vPart);
  return { main: mPart.toFixed(2), vat: vPart.toFixed(2) };
}

function prefillIncomePaymentProjectRows(editing: DraftLike, amountGrossStr: string) {
  const inv = {
    projectAllocations: (editing.projectAllocations ?? []).map((a) => ({
      projectId: a.projectId,
      grossAmount: a.grossAmount,
    })),
    grossAmount: editing.grossAmount,
    projectId: editing.projectId ?? null,
  };
  const slices = documentGrossSlicesFromInvoice(inv);
  return defaultProportionalPaymentAllocationRows(slices, amountGrossStr);
}

type IncomeInvoiceFormModalProps = {
  open: boolean;
  editing: DraftLike;
  setEditing: Dispatch<SetStateAction<DraftLike>>;
  formError: string | null;
  setFormError: Dispatch<SetStateAction<string | null>>;
  pdfDraftNote: string | null;
  saving: boolean;
  categories: Cat[];
  projects: ProjectOption[];
  closeModal: () => void;
  save: (e: FormEvent) => Promise<void>;
  applyIncomePdfDraft: (res: InvoicePdfDraftResponse) => void;
  projectAllocMode: "simple" | "multi";
  setProjectAllocMode: Dispatch<SetStateAction<"simple" | "multi">>;
  projectAllocRows: ProjectAllocRow[];
  setProjectAllocRows: Dispatch<SetStateAction<ProjectAllocRow[]>>;
  amountEntryMode: AmountEntryMode;
  handleAmountModeChange: (mode: AmountEntryMode) => void;
  applyPaymentDue: (dueYmd: string) => void;
  plannedIncomeManualRef: MutableRefObject<boolean>;
  planSaving: boolean;
  newPlanRow: (sortOrder: number) => NonNullable<DraftLike["plannedPayments"]>[number];
  savePaymentPlan: () => Promise<void>;
  applyPlanQuickFill: (mode: "vat" | "main" | "rest") => void;
  planRowFocusIdxRef: MutableRefObject<number>;
  payOpen: boolean;
  setPayOpen: Dispatch<SetStateAction<boolean>>;
  submitPayment: (e: FormEvent) => Promise<void>;
  payDraft: PayDraft;
  setPayDraft: Dispatch<SetStateAction<PayDraft>>;
  paySaving: boolean;
  payProjectManual: boolean;
  setPayProjectManual: Dispatch<SetStateAction<boolean>>;
  payProjectRows: PayProjectRow[];
  setPayProjectRows: Dispatch<SetStateAction<PayProjectRow[]>>;
  paySplitMain: string;
  setPaySplitMain: Dispatch<SetStateAction<string>>;
  paySplitVat: string;
  setPaySplitVat: Dispatch<SetStateAction<string>>;
  todayYmd: () => string;
  prefillIncomePaymentCashflowSplit: (editing: DraftLike, grossStr: string) => { main: string; vat: string };
  prefillIncomePaymentProjectRows: (editing: DraftLike, amountGrossStr: string) => PayProjectRow[];
  incomeInvoiceMultiProject: (editing: Pick<DraftLike, "projectAllocations" | "projectId">) => boolean;
  deletePayment: (paymentId: string) => Promise<void>;
  deleteInvoice?: (invoiceId: string) => Promise<void>;
  overlayZIndexClass?: string;
};

export function IncomeInvoiceFormModal({
  open,
  editing,
  setEditing,
  formError,
  setFormError,
  pdfDraftNote,
  saving,
  categories,
  projects,
  closeModal,
  save,
  applyIncomePdfDraft,
  projectAllocMode,
  setProjectAllocMode,
  projectAllocRows,
  setProjectAllocRows,
  amountEntryMode,
  handleAmountModeChange,
  applyPaymentDue,
  plannedIncomeManualRef,
  planSaving,
  newPlanRow,
  savePaymentPlan,
  applyPlanQuickFill,
  planRowFocusIdxRef,
  payOpen,
  setPayOpen,
  submitPayment,
  payDraft,
  setPayDraft,
  paySaving,
  payProjectManual,
  setPayProjectManual,
  payProjectRows,
  setPayProjectRows,
  paySplitMain,
  setPaySplitMain,
  paySplitVat,
  setPaySplitVat,
  todayYmd,
  prefillIncomePaymentCashflowSplit,
  prefillIncomePaymentProjectRows,
  incomeInvoiceMultiProject,
  deletePayment,
  deleteInvoice,
  overlayZIndexClass = "z-50",
}: IncomeInvoiceFormModalProps) {
  async function handleDeleteInvoice() {
    if (!editing.id || !deleteInvoice) return;
    if (!confirm("Usunąć tę fakturę przychodową? Tej operacji nie można cofnąć.")) return;
    await deleteInvoice(editing.id);
  }

  return (
    <>
      <Modal
        open={open}
        title={editing.id ? "Edycja faktury przychodowej" : "Nowa faktura przychodowa"}
        onClose={closeModal}
        size="lg"
        overlayZIndexClass={overlayZIndexClass}
      >
        <form onSubmit={save} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          {formError && <Alert variant="error">{formError}</Alert>}
          {pdfDraftNote ? (
            <Alert variant="info">
              <p className="whitespace-pre-wrap text-sm">{pdfDraftNote}</p>
            </Alert>
          ) : null}
          <InvoicePdfDraftSection kind="income" disabled={saving} onDraft={applyIncomePdfDraft} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Numer faktury">
              <Input
                value={editing.invoiceNumber}
                onChange={(e) => setEditing({ ...editing, invoiceNumber: e.target.value })}
                required
                disabled={saving}
              />
            </Field>
            <Field label="Kontrahent">
              <ContractorAutocomplete
                value={editing.contractor}
                onChange={(contractor) => setEditing({ ...editing, contractor })}
                required
                disabled={saving}
                placeholder="Wpisz lub wybierz kontrahenta z katalogu"
              />
            </Field>
          </div>
          <Field label="Kategoria przychodu">
            <Select
              value={editing.incomeCategoryId ?? ""}
              onChange={(e) => setEditing({ ...editing, incomeCategoryId: e.target.value || null })}
              disabled={saving}
            >
              <option value="">(brak)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Opis">
            <Textarea
              rows={2}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              disabled={saving}
            />
          </Field>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300"
                checked={projectAllocMode === "multi"}
                disabled={saving}
                onChange={(e) => {
                  const on = e.target.checked;
                  setProjectAllocMode(on ? "multi" : "simple");
                  if (on) {
                    setProjectAllocRows((prev) => {
                      if (prev.length > 0) return prev;
                      const pid = editing.projectId?.trim();
                      if (pid) {
                        return [
                          {
                            projectId: pid,
                            netAmount: editing.netAmount,
                            grossAmount: editing.grossAmount,
                            description: "",
                          },
                        ];
                      }
                      return [{ projectId: "", netAmount: editing.netAmount, grossAmount: editing.grossAmount, description: "" }];
                    });
                  } else {
                    setProjectAllocRows([]);
                  }
                }}
              />
              Alokacja na kilka projektów (suma netto i brutto = dokument)
            </label>
            {projectAllocMode === "multi" ? (
              <div className="mt-3 space-y-2">
                {projectAllocRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid gap-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800 sm:grid-cols-2 lg:grid-cols-4"
                  >
                    <div className="block text-sm">
                      <div className="mb-1 flex min-h-[1.25rem] items-center justify-between gap-2">
                        <span className="block font-medium text-zinc-700 dark:text-zinc-300">Projekt</span>
                        {row.projectId.trim() ? (
                          <Link
                            href={`/projects/${row.projectId.trim()}`}
                            className="shrink-0 text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                          >
                            Otwórz
                          </Link>
                        ) : null}
                      </div>
                      <ProjectSearchPicker
                        value={row.projectId.trim() || null}
                        onChange={(id) =>
                          setProjectAllocRows((rows) =>
                            rows.map((x, i) => (i === idx ? { ...x, projectId: id ?? "" } : x)),
                          )
                        }
                        listSort="code"
                        disabled={saving}
                      />
                    </div>
                    <Field label="Netto (alokacja)">
                      <Input
                        value={row.netAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, netAmount: v } : x)));
                        }}
                        disabled={saving}
                      />
                    </Field>
                    <Field label="Brutto (alokacja)">
                      <Input
                        value={row.grossAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, grossAmount: v } : x)));
                        }}
                        disabled={saving}
                      />
                    </Field>
                    <Field label="Notatka (opcjonalnie)">
                      <Input
                        value={row.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) => rows.map((x, i) => (i === idx ? { ...x, description: v } : x)));
                        }}
                        disabled={saving}
                      />
                    </Field>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="!text-xs"
                    disabled={saving}
                    onClick={() =>
                      setProjectAllocRows((rows) => [
                        ...rows,
                        { projectId: "", netAmount: editing.netAmount, grossAmount: editing.grossAmount, description: "" },
                      ])
                    }
                  >
                    + Wiersz
                  </Button>
                  {projectAllocRows.length > 1 ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!text-xs"
                      disabled={saving}
                      onClick={() => setProjectAllocRows((rows) => rows.slice(0, -1))}
                    >
                      Usuń ostatni
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="block text-sm">
                <div className="mb-1 flex min-h-[1.25rem] items-center justify-between gap-2">
                  <span className="block font-medium text-zinc-700 dark:text-zinc-300">Projekt</span>
                  {editing.projectId ? (
                    <Link
                      href={`/projects/${editing.projectId}`}
                      className="shrink-0 text-xs font-medium text-zinc-700 underline dark:text-zinc-300"
                    >
                      Otwórz projekt
                    </Link>
                  ) : null}
                </div>
                <ProjectSearchPicker
                  value={editing.projectId ?? null}
                  onChange={(id) => setEditing({ ...editing, projectId: id })}
                  disabled={saving}
                />
                {!editing.projectId && (editing.projectName ?? "").trim() ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Legacy: „{(editing.projectName ?? "").trim()}” — wybierz projekt z listy, aby powiązać rekord.
                  </p>
                ) : null}
              </div>
            )}
          </div>
          <InvoiceAmountFields
            mode={amountEntryMode}
            onModeChange={handleAmountModeChange}
            netAmount={editing.netAmount}
            vatRate={editing.vatRate}
            vatAmount={editing.vatAmount}
            grossAmount={editing.grossAmount}
            disabled={saving}
            onNetChange={(net) => {
              setEditing((prev) => {
                const a = amountsFromNetRate(net, prev.vatRate as VatRatePct);
                return { ...prev, netAmount: net, ...a };
              });
            }}
            onGrossChange={(gross) => {
              setEditing((prev) => {
                const a = amountsFromGrossRate(gross, prev.vatRate as VatRatePct);
                return { ...prev, grossAmount: gross, netAmount: a.netAmount, vatAmount: a.vatAmount };
              });
            }}
            onVatRateChange={(rate) => {
              setEditing((prev) => {
                if (amountEntryMode === "gross") {
                  const a = amountsFromGrossRate(prev.grossAmount, rate);
                  return { ...prev, vatRate: rate, netAmount: a.netAmount, vatAmount: a.vatAmount };
                }
                const a = amountsFromNetRate(prev.netAmount, rate);
                return { ...prev, vatRate: rate, ...a };
              });
            }}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Data wystawienia">
              <Input
                type="date"
                value={editing.issueDate ?? ""}
                onChange={(e) => setEditing({ ...editing, issueDate: e.target.value })}
                required
                disabled={saving}
              />
            </Field>
            <Field label="Termin płatności">
              <Input
                type="date"
                value={editing.paymentDueDate ?? ""}
                onChange={(e) => applyPaymentDue(e.target.value)}
                required
                disabled={saving}
              />
              <DueDateOffsetControls
                baseYmd={editing.issueDate ?? ""}
                disabled={saving}
                onApplyDue={applyPaymentDue}
              />
            </Field>
            <Field label="Planowana data wpływu">
              <Input
                type="date"
                value={editing.plannedIncomeDate ?? ""}
                onChange={(e) => {
                  plannedIncomeManualRef.current = true;
                  setEditing({ ...editing, plannedIncomeDate: e.target.value });
                }}
                required
                disabled={saving || (editing.plannedPayments?.length ?? 0) > 0}
                className={
                  (editing.plannedPayments?.length ?? 0) > 0 ? "opacity-60" : undefined
                }
              />
              {(editing.plannedPayments?.length ?? 0) > 0 ? (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Aktywny plan wpłat — daty wpływu w prognozie biorą się z harmonogramu poniżej; to pole zostaje jako
                  zapas przy braku planu.
                </p>
              ) : null}
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select
                value={editing.status}
                onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                disabled={saving}
              >
                <option value="PLANOWANA">Planowana</option>
                <option value="WYSTAWIONA">Wystawiona</option>
                <option value="PARTIALLY_RECEIVED">Częściowo opłacona</option>
                <option value="OPLACONA">Opłacona</option>
              </Select>
            </Field>
            <Field label="Rozliczenie VAT (konto docelowe)">
              <Select
                value={editing.vatDestination}
                onChange={(e) => setEditing({ ...editing, vatDestination: e.target.value })}
                disabled={saving}
              >
                <option value="MAIN">MAIN — całe brutto na konto główne</option>
                <option value="VAT">VAT — netto na MAIN, VAT na konto VAT</option>
              </Select>
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={editing.confirmedIncome}
              onChange={(e) => setEditing({ ...editing, confirmedIncome: e.target.checked })}
              disabled={saving}
            />
            Wpływ potwierdzony (informacyjnie)
          </label>
          <Field label="Data faktycznego wpływu (gdy status: opłacona)">
            <Input
              type="date"
              value={editing.actualIncomeDate ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setEditing({ ...editing, actualIncomeDate: v || null });
              }}
              disabled={saving}
            />
          </Field>
          {editing.isGeneratedFromRecurring ? (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-zinc-300"
                checked={!!editing.isRecurringDetached}
                onChange={(e) => setEditing({ ...editing, isRecurringDetached: e.target.checked })}
                disabled={saving}
              />
              <span>
                Odłącz od reguły cyklicznej — zmiany reguły nie nadpiszą tej faktury przy synchronizacji.
              </span>
            </label>
          ) : null}
          <Field label="Notatki">
            <Textarea
              rows={2}
              value={editing.notes}
              onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              disabled={saving}
            />
          </Field>
          {editing.id ? (
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/40 p-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Plan wpłat</span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="!py-1.5 !text-xs"
                    disabled={saving || planSaving}
                    onClick={() => {
                      setEditing((prev) => {
                        const next = [...(prev.plannedPayments ?? [])];
                        next.push(newPlanRow(next.length));
                        return { ...prev, plannedPayments: next };
                      });
                    }}
                  >
                    Dodaj termin
                  </Button>
                  <Button
                    type="button"
                    className="!py-1.5 !text-xs"
                    disabled={saving || planSaving}
                    onClick={() => void savePaymentPlan()}
                  >
                    {planSaving ? <Spinner className="!size-4" /> : null}
                    Zapisz plan wpłat
                  </Button>
                </div>
              </div>
              <p className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
                Harmonogram planowany (MAIN / VAT) — informacyjnie; nie zastępuje rzeczywistych wpłat poniżej. Edycja
                wiersza używa bezpiecznej aktualizacji stanu — zapisz plan, aby trwale zapisać w bazie.
              </p>
              <div className="mb-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1 !text-xs"
                  disabled={saving || planSaving}
                  onClick={() => applyPlanQuickFill("vat")}
                >
                  Pozostały VAT
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1 !text-xs"
                  disabled={saving || planSaving}
                  onClick={() => applyPlanQuickFill("main")}
                >
                  Pozostałe MAIN
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1 !text-xs"
                  disabled={saving || planSaving}
                  onClick={() => applyPlanQuickFill("rest")}
                >
                  Uzupełnij resztę faktury
                </Button>
              </div>
              {(() => {
                const plan = editing.plannedPayments ?? [];
                const sumMain = round2(
                  plan.reduce((s, r) => s + Number(normalizeDecimalInput(r.plannedMainAmount || "0")), 0),
                );
                const sumVat = round2(
                  plan.reduce((s, r) => s + Number(normalizeDecimalInput(r.plannedVatAmount || "0")), 0),
                );
                const sumTot = round2(sumMain + sumVat);
                const invNet = round2(Number(normalizeDecimalInput(editing.netAmount || "0")));
                const invVat = round2(Number(normalizeDecimalInput(editing.vatAmount || "0")));
                const invGross = round2(invNet + invVat);
                const dMain = round2(sumMain - invNet);
                const dVat = round2(sumVat - invVat);
                const dTot = round2(sumTot - invGross);
                const over = dMain > PAY_EPS || dVat > PAY_EPS;
                const incomplete = dMain < -PAY_EPS || dVat < -PAY_EPS;
                const ok = !over && !incomplete;
                return (
                  <div
                    className={`mb-2 space-y-1 rounded-md border p-2 text-xs ${
                      over
                        ? "border-red-300 bg-red-50/90 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
                        : incomplete
                          ? "border-amber-300 bg-amber-50/80 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
                          : "border-emerald-200/80 bg-white/60 text-zinc-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-zinc-100"
                    }`}
                  >
                    <div className="grid gap-0.5 sm:grid-cols-2">
                      <span>
                        Suma MAIN (plan): <strong className="tabular-nums">{formatMoney(sumMain)}</strong> · netto
                        faktury: <strong className="tabular-nums">{formatMoney(invNet)}</strong>
                      </span>
                      <span>
                        Suma VAT (plan): <strong className="tabular-nums">{formatMoney(sumVat)}</strong> · VAT faktury:{" "}
                        <strong className="tabular-nums">{formatMoney(invVat)}</strong>
                      </span>
                      <span>
                        Suma razem (plan): <strong className="tabular-nums">{formatMoney(sumTot)}</strong> · brutto
                        faktury: <strong className="tabular-nums">{formatMoney(invGross)}</strong>
                      </span>
                      <span>
                        Różnica MAIN / VAT / razem:{" "}
                        <strong className="tabular-nums">
                          {formatMoney(dMain)} / {formatMoney(dVat)} / {formatMoney(dTot)}
                        </strong>
                      </span>
                    </div>
                    {over ? (
                      <p className="font-medium">Plan przekracza fakturę — zapis planu jest zablokowany do skorygowania kwot.</p>
                    ) : incomplete ? (
                      <p className="font-medium">Plan niepełny (poniżej netto/VAT faktury) — zapis dozwolony.</p>
                    ) : (
                      <p className="text-emerald-800 dark:text-emerald-200/90">Plan zgodny z kwotami faktury (MAIN/VAT).</p>
                    )}
                  </div>
                );
              })()}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-emerald-200 dark:border-emerald-900/60">
                      <th className="py-1 pr-2">Termin</th>
                      <th className="py-1 pr-2">MAIN (plan)</th>
                      <th className="py-1 pr-2">VAT (plan)</th>
                      <th className="py-1 pr-2">Razem</th>
                      <th className="py-1 pr-2">Status</th>
                      <th className="py-1 pr-2">Opis</th>
                      <th className="py-1 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(editing.plannedPayments ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-2 text-zinc-500">
                          Brak pozycji — użyj „Dodaj termin”, np. transza 1: część netto + pełny VAT, transza 2: reszta netto.
                        </td>
                      </tr>
                    ) : (
                      (editing.plannedPayments ?? []).map((row, idx) => {
                        const mainN = Number(normalizeDecimalInput(row.plannedMainAmount || "0"));
                        const vatN = Number(normalizeDecimalInput(row.plannedVatAmount || "0"));
                        const tot = mainN + vatN;
                        const rowKey = row.id ?? row.clientKey ?? `plan-row-${idx}`;
                        return (
                          <tr
                            key={rowKey}
                            className="border-b border-emerald-100/80 dark:border-emerald-900/40"
                            onFocusCapture={() => {
                              planRowFocusIdxRef.current = idx;
                            }}
                          >
                            <td className="py-1.5 pr-2 align-top">
                              <Input
                                type="date"
                                className="!py-1 !text-xs"
                                value={row.dueDate}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setEditing((prev) => {
                                    const next = [...(prev.plannedPayments ?? [])];
                                    next[idx] = { ...next[idx], dueDate: v };
                                    return { ...prev, plannedPayments: next };
                                  });
                                }}
                                onFocus={() => {
                                  planRowFocusIdxRef.current = idx;
                                }}
                                disabled={saving || planSaving}
                              />
                            </td>
                            <td className="py-1.5 pr-2 align-top">
                              <Input
                                className="!py-1 !text-xs tabular-nums"
                                value={row.plannedMainAmount}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setEditing((prev) => {
                                    const next = [...(prev.plannedPayments ?? [])];
                                    next[idx] = { ...next[idx], plannedMainAmount: v };
                                    return { ...prev, plannedPayments: next };
                                  });
                                }}
                                onFocus={() => {
                                  planRowFocusIdxRef.current = idx;
                                }}
                                disabled={saving || planSaving}
                              />
                            </td>
                            <td className="py-1.5 pr-2 align-top">
                              <Input
                                className="!py-1 !text-xs tabular-nums"
                                value={row.plannedVatAmount}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setEditing((prev) => {
                                    const next = [...(prev.plannedPayments ?? [])];
                                    next[idx] = { ...next[idx], plannedVatAmount: v };
                                    return { ...prev, plannedPayments: next };
                                  });
                                }}
                                onFocus={() => {
                                  planRowFocusIdxRef.current = idx;
                                }}
                                disabled={saving || planSaving}
                              />
                            </td>
                            <td className="py-1.5 pr-2 tabular-nums align-top">{formatMoney(tot)}</td>
                            <td className="py-1.5 pr-2 align-top">
                              <Select
                                className="!py-1 !text-xs"
                                value={row.status}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setEditing((prev) => {
                                    const next = [...(prev.plannedPayments ?? [])];
                                    next[idx] = { ...next[idx], status: v };
                                    return { ...prev, plannedPayments: next };
                                  });
                                }}
                                onFocus={() => {
                                  planRowFocusIdxRef.current = idx;
                                }}
                                disabled={saving || planSaving}
                              >
                                <option value="PLANNED">Zaplanowane</option>
                                <option value="DONE">Wykonane</option>
                                <option value="CANCELLED">Anulowane</option>
                              </Select>
                            </td>
                            <td className="py-1.5 pr-2 align-top">
                              <Input
                                className="!py-1 !text-xs"
                                value={row.note}
                                placeholder="np. po odbiorze bez usterek"
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setEditing((prev) => {
                                    const next = [...(prev.plannedPayments ?? [])];
                                    next[idx] = { ...next[idx], note: v };
                                    return { ...prev, plannedPayments: next };
                                  });
                                }}
                                onFocus={() => {
                                  planRowFocusIdxRef.current = idx;
                                }}
                                disabled={saving || planSaving}
                              />
                            </td>
                            <td className="py-1.5 text-right align-top">
                              <Button
                                type="button"
                                variant="ghost"
                                className="!py-0.5 !text-xs text-red-600"
                                disabled={saving || planSaving}
                                onClick={() => {
                                  setEditing((prev) => {
                                    const next = (prev.plannedPayments ?? []).filter((_, i) => i !== idx);
                                    return {
                                      ...prev,
                                      plannedPayments: next.map((r, i) => ({ ...r, sortOrder: i })),
                                    };
                                  });
                                }}
                              >
                                Usuń
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {editing.id ? (
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Wpłaty (brutto)</span>
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1.5 !text-xs"
                  onClick={() => {
                    setFormError(null);
                    const inv = editing as unknown as IncomeInvoice;
                    const pays = (editing.payments ?? []) as unknown as PayPick[];
                    const remaining = incomeRemainingGross(inv, pays);
                    const amt =
                      remaining > 0 ? String(remaining) : (Number(editing.grossAmount) > 0 ? String(editing.grossAmount) : "");
                    setPayProjectManual(false);
                    setPayDraft({
                      amountGross: amt,
                      paymentDate: todayYmd(),
                      notes: "",
                    });
                    const spl = prefillIncomePaymentCashflowSplit(editing, amt);
                    setPaySplitMain(spl.main);
                    setPaySplitVat(spl.vat);
                    setPayProjectRows(
                      incomeInvoiceMultiProject(editing) && amt ? prefillIncomePaymentProjectRows(editing, amt) : [],
                    );
                    setPayOpen(true);
                  }}
                  disabled={saving}
                >
                  Dodaj wpłatę
                </Button>
              </div>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                Częściowe lub rozłożone w czasie — dodawaj wpłaty ręcznie. Pełne rozliczenie możesz ustawić statusem
                „Opłacona”: brakująca kwota zapisze się tu automatycznie (data z faktycznego wpływu lub planowanego).
              </p>
              {(() => {
                const inv = editing as unknown as IncomeInvoice;
                const pays = (editing.payments ?? []) as unknown as PayPick[];
                const g = Number(editing.grossAmount) || 0;
                const settled = sumIncomePaymentsGross(pays);
                const remaining = incomeRemainingGross(inv, pays);
                const pct = g > 0 ? Math.round((settled / g) * 1000) / 10 : 0;
                return (
                  <div className="mb-2 text-xs text-zinc-600 dark:text-zinc-400">
                    Rozliczono: {formatMoney(settled)} / brutto {formatMoney(g)} · Pozostało: {formatMoney(remaining)} ·{" "}
                    {pct}% dokumentu
                  </div>
                );
              })()}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-700">
                      <th className="py-1 pr-2">Kwota</th>
                      <th className="py-1 pr-2">Data</th>
                      <th className="py-1 pr-2">Notatka</th>
                      <th className="py-1 text-right"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {((editing.payments ?? []) as {
                      id: string;
                      amountGross: string;
                      paymentDate: string;
                      notes: string;
                      allocatedMainAmount?: string | null;
                      allocatedVatAmount?: string | null;
                    }[]).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-2 text-zinc-500">
                          Brak wpłat
                        </td>
                      </tr>
                    ) : (
                      ((editing.payments ?? []) as {
                        id: string;
                        amountGross: string;
                        paymentDate: string;
                        notes: string;
                        allocatedMainAmount?: string | null;
                        allocatedVatAmount?: string | null;
                      }[]).map((p) => (
                          <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800">
                            <td className="py-1.5 pr-2 tabular-nums">
                              <div>{formatMoney(Number(p.amountGross))}</div>
                              {p.allocatedMainAmount != null && p.allocatedVatAmount != null ? (
                                <div className="mt-0.5 text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                                  cashflow: MAIN {formatMoney(Number(p.allocatedMainAmount))} · VAT{" "}
                                  {formatMoney(Number(p.allocatedVatAmount))}
                                </div>
                              ) : null}
                            </td>
                            <td className="py-1.5 pr-2">{formatDate(p.paymentDate)}</td>
                            <td className="py-1.5 pr-2">{p.notes || "—"}</td>
                            <td className="py-1.5 text-right">
                              <Button
                                type="button"
                                variant="ghost"
                                className="!py-0.5 !text-xs text-red-600"
                                onClick={() => deletePayment(p.id)}
                                disabled={saving}
                              >
                                Usuń
                              </Button>
                            </td>
                          </tr>
                        ),
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="!size-4" /> : null}
              Zapisz
            </Button>
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Anuluj
            </Button>
            {editing.id && deleteInvoice ? (
              <Button type="button" variant="danger" onClick={() => void handleDeleteInvoice()} disabled={saving}>
                Usuń fakturę
              </Button>
            ) : null}
          </div>
        </form>
      </Modal>

      <Modal
        open={payOpen}
        title="Nowa wpłata"
        onClose={() => setPayOpen(false)}
        overlayZIndexClass={overlayZIndexClass}
      >
        <form onSubmit={submitPayment} className="space-y-3">
          {formError && payOpen ? <Alert variant="error">{formError}</Alert> : null}
          <Field label="Kwota brutto">
            <Input
              value={payDraft.amountGross}
              onChange={(e) => {
                const v = e.target.value;
                setPayDraft({ ...payDraft, amountGross: v });
                if (!payProjectManual && incomeInvoiceMultiProject(editing) && v.trim()) {
                  setPayProjectRows(prefillIncomePaymentProjectRows(editing, v));
                }
              }}
              required
              disabled={paySaving}
            />
          </Field>
          {incomeInvoiceMultiProject(editing) && payProjectRows.length > 0 ? (
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Podział na projekty (brutto)</span>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-zinc-300"
                    checked={payProjectManual}
                    onChange={(e) => setPayProjectManual(e.target.checked)}
                    disabled={paySaving}
                  />
                  Ręczny
                </label>
              </div>
              <p className="mb-2 text-xs text-zinc-500">
                Domyślnie proporcje jak w alokacji dokumentu. Zaznacz „Ręczny”, aby poprawić kwoty.
              </p>
              <div className="space-y-2">
                {payProjectRows.map((row, idx) => {
                  const name =
                    editing.projectAllocations?.find((a) => a.projectId === row.projectId)?.project?.name ??
                    projects.find((p) => p.id === row.projectId)?.name ??
                    row.projectId;
                  return (
                    <div key={`${row.projectId}-${idx}`} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="min-w-[120px] flex-1 font-medium text-zinc-800 dark:text-zinc-200">{name}</span>
                      <Input
                        className="max-w-[140px]"
                        value={row.grossAmount}
                        disabled={paySaving || !payProjectManual}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPayProjectRows((rows) => rows.map((x, i) => (i === idx ? { ...x, grossAmount: val } : x)));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="mt-2 !text-xs"
                disabled={paySaving}
                onClick={() => {
                  setPayProjectManual(false);
                  setPayProjectRows(prefillIncomePaymentProjectRows(editing, payDraft.amountGross || "0"));
                }}
              >
                Przelicz wg proporcji dokumentu
              </Button>
            </div>
          ) : null}
          {editing.vatDestination === "VAT" && !incomeInvoiceMultiProject(editing) ? (
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Podział cashflow (MAIN / VAT)
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1 !text-xs"
                  disabled={paySaving}
                  onClick={() => {
                    const s = prefillIncomePaymentCashflowSplit(editing, payDraft.amountGross || "0");
                    setPaySplitMain(s.main);
                    setPaySplitVat(s.vat);
                  }}
                >
                  Przelicz z kwoty brutto
                </Button>
              </div>
              <p className="mb-2 text-xs text-zinc-500">
                Suma musi równać się kwocie brutto wpłaty. Ustaw np. pełny VAT na konto VAT i resztę netto na MAIN.
              </p>
              <div className="flex flex-wrap gap-2">
                <Field label="MAIN (netto)">
                  <Input
                    value={paySplitMain}
                    onChange={(e) => setPaySplitMain(e.target.value)}
                    disabled={paySaving}
                    className="max-w-[160px] font-mono"
                  />
                </Field>
                <Field label="VAT">
                  <Input
                    value={paySplitVat}
                    onChange={(e) => setPaySplitVat(e.target.value)}
                    disabled={paySaving}
                    className="max-w-[160px] font-mono"
                  />
                </Field>
              </div>
            </div>
          ) : null}
          <Field label="Data wpłaty">
            <Input
              type="date"
              value={payDraft.paymentDate}
              onChange={(e) => setPayDraft({ ...payDraft, paymentDate: e.target.value })}
              required
              disabled={paySaving}
            />
          </Field>
          <Field label="Notatka">
            <Input
              value={payDraft.notes}
              onChange={(e) => setPayDraft({ ...payDraft, notes: e.target.value })}
              disabled={paySaving}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={paySaving}>
              {paySaving ? <Spinner className="!size-4" /> : null}
              Zapisz wpłatę
            </Button>
            <Button type="button" variant="secondary" onClick={() => setPayOpen(false)} disabled={paySaving}>
              Anuluj
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function NewIncomeInvoiceFormModal({
  open,
  contractorName,
  invoiceId,
  projectId,
  projectName,
  projectCode,
  onClose,
  onSaved,
  overlayZIndexClass = "z-50",
}: {
  open: boolean;
  contractorName: string;
  invoiceId?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectCode?: string | null;
  onClose: () => void;
  onSaved: () => void;
  overlayZIndexClass?: string;
}) {
  const [editing, setEditing] = useState<DraftLike>(() =>
    createEmptyIncomeDraft(contractorName, projectId ?? null, projectName, projectCode),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfDraftNote, setPdfDraftNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [amountEntryMode, setAmountEntryMode] = useState<AmountEntryMode>("net");
  const [projectAllocMode, setProjectAllocMode] = useState<"simple" | "multi">("simple");
  const [projectAllocRows, setProjectAllocRows] = useState<ProjectAllocRow[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payDraft, setPayDraft] = useState<PayDraft>({ amountGross: "", paymentDate: "", notes: "" });
  const [payProjectRows, setPayProjectRows] = useState<PayProjectRow[]>([]);
  const [payProjectManual, setPayProjectManual] = useState(false);
  const [paySplitMain, setPaySplitMain] = useState("");
  const [paySplitVat, setPaySplitVat] = useState("");
  const plannedIncomeManualRef = useRef(false);
  const planRowFocusIdxRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    plannedIncomeManualRef.current = false;
    setFormError(null);
    setPdfDraftNote(null);
    setSaving(false);
    setAmountEntryMode("net");
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
    setPayOpen(false);
    setPayDraft({ amountGross: "", paymentDate: "", notes: "" });
    setPayProjectRows([]);
    setPayProjectManual(false);
    setPaySplitMain("");
    setPaySplitVat("");
    if (!invoiceId) {
      setEditing(createEmptyIncomeDraft(contractorName, projectId ?? null, projectName, projectCode));
      return;
    }
    setSaving(true);
    void (async () => {
      try {
        const res = await fetch(`/api/income-invoices/${invoiceId}`);
        const row = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setFormError(readApiErrorBody(row));
          return;
        }
        const rate = (row.vatRate ?? inferVatRateFromAmounts(Number(row.netAmount), Number(row.vatAmount))) as VatRatePct;
        const plannedIncomeDate = isoToDateInputValue(row.plannedIncomeDate);
        const paymentDueDate = isoToDateInputValue(row.paymentDueDate);
        plannedIncomeManualRef.current = plannedIncomeDate !== paymentDueDate;
        setEditing({
          ...row,
          isGeneratedFromRecurring: !!row.isGeneratedFromRecurring,
          isRecurringDetached: !!row.isRecurringDetached,
          vatRate: rate,
          incomeCategoryId: row.incomeCategoryId ?? null,
          issueDate: isoToDateInputValue(row.issueDate),
          paymentDueDate,
          plannedIncomeDate,
          actualIncomeDate: row.actualIncomeDate ? isoToDateInputValue(row.actualIncomeDate) : null,
          netAmount: String(row.netAmount),
          vatAmount: String(row.vatAmount),
          grossAmount: String(row.grossAmount),
          plannedPayments: normalizePlannedFromApi(row.plannedPayments),
        });
        const allocations = row.projectAllocations;
        if (Array.isArray(allocations) && allocations.length > 0) {
          setProjectAllocMode("multi");
          setProjectAllocRows(
            allocations.map((a) => ({
              projectId: a.projectId,
              netAmount: String(a.netAmount),
              grossAmount: String(a.grossAmount),
              description: a.description ?? "",
            })),
          );
        }
      } catch {
        if (!cancelled) setFormError("Błąd sieci przy pobieraniu faktury.");
      } finally {
        if (!cancelled) setSaving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contractorName, invoiceId, open, projectCode, projectId, projectName]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/income-categories")
      .then((r) => r.json())
      .then((j: Cat[]) => setCategories(Array.isArray(j) ? j : []))
      .catch(() => setCategories([]));
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j: ProjectOption[]) => setProjects(Array.isArray(j) ? j : []))
      .catch(() => setProjects([]));
  }, [open]);

  function closeModal() {
    setPayOpen(false);
    onClose();
  }

  function applyIncomePdfDraft(res: InvoicePdfDraftResponse) {
    const v = res.values;
    setEditing((prev) => {
      const next = { ...prev };
      if (v.invoiceNumber?.trim()) next.invoiceNumber = v.invoiceNumber.trim();
      if (v.contractor?.trim()) next.contractor = v.contractor.trim();
      if (v.description?.trim()) next.description = v.description.trim();
      if (v.issueDate) next.issueDate = v.issueDate;
      if (v.paymentDueDate) {
        next.paymentDueDate = v.paymentDueDate;
        next.plannedIncomeDate = v.paymentDueDate;
      }
      if (v.documentDate && !v.issueDate) next.issueDate = v.documentDate;
      if (v.netAmount) next.netAmount = v.netAmount;
      if (v.vatAmount) next.vatAmount = v.vatAmount;
      if (v.grossAmount) next.grossAmount = v.grossAmount;
      if (v.vatRate != null && v.netAmount && v.vatAmount) next.vatRate = v.vatRate;
      return next;
    });
    if (res.values.netAmount) setAmountEntryMode("net");
    const parts: string[] = [];
    if (res.filledLabels.length) parts.push(`Uzupełniono z PDF: ${res.filledLabels.join(", ")}.`);
    for (const w of res.warnings) parts.push(w);
    setPdfDraftNote(parts.join("\n"));
    setFormError(null);
  }

  function handleAmountModeChange(m: AmountEntryMode) {
    setAmountEntryMode(m);
    setEditing((prev) => {
      if (m === "gross") {
        const a = amountsFromGrossRate(prev.grossAmount, prev.vatRate as VatRatePct);
        return { ...prev, netAmount: a.netAmount, vatAmount: a.vatAmount };
      }
      const a = amountsFromNetRate(prev.netAmount, prev.vatRate as VatRatePct);
      return { ...prev, vatAmount: a.vatAmount, grossAmount: a.grossAmount };
    });
  }

  function applyPaymentDue(dueYmd: string) {
    setEditing((prev) => {
      const next = { ...prev, paymentDueDate: dueYmd };
      if (!plannedIncomeManualRef.current) {
        next.plannedIncomeDate = dueYmd;
      }
      return next;
    });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const issueDate = toIsoOrNull(String(editing.issueDate ?? ""));
    const paymentDueDate = toIsoOrNull(String(editing.paymentDueDate ?? ""));
    const plannedIncomeDate = toIsoOrNull(String(editing.plannedIncomeDate ?? ""));
    if (!issueDate || !paymentDueDate || !plannedIncomeDate) {
      setFormError("Uzupełnij poprawnie datę wystawienia, termin płatności i planowaną datę wpływu.");
      setSaving(false);
      return;
    }

    if (projectAllocMode === "multi") {
      const ok = projectAllocRows.filter((row) => row.projectId.trim());
      if (ok.length === 0) {
        setFormError("Tryb kilku projektów: dodaj co najmniej jeden wiersz z wybranym projektem.");
        setSaving(false);
        return;
      }
    }

    const allocPart: Record<string, unknown> = (() => {
      if (projectAllocMode === "multi") {
        return {
          projectAllocations: projectAllocRows
            .filter((row) => row.projectId.trim())
            .map((row) => ({
              projectId: row.projectId,
              netAmount: normalizeDecimalInput(row.netAmount),
              grossAmount: normalizeDecimalInput(row.grossAmount),
              description: row.description.trim(),
            })),
        };
      }
      if (editing.id) return { projectAllocations: [] as never[] };
      return {};
    })();

    const projectField = projectAllocMode === "multi" ? { projectId: null } : { projectId: editing.projectId?.trim() || null };
    const recurringPatch =
      editing.id && editing.isGeneratedFromRecurring
        ? { isRecurringDetached: !!editing.isRecurringDetached }
        : {};
    const body = {
      invoiceNumber: editing.invoiceNumber,
      contractor: editing.contractor,
      description: editing.description,
      vatRate: editing.vatRate,
      netAmount: normalizeDecimalInput(editing.netAmount),
      issueDate,
      paymentDueDate,
      plannedIncomeDate,
      status: editing.status,
      vatDestination: editing.vatDestination,
      confirmedIncome: editing.confirmedIncome,
      actualIncomeDate: toIsoOrNull(editing.actualIncomeDate ?? undefined),
      notes: editing.notes,
      ...projectField,
      incomeCategoryId: editing.incomeCategoryId || null,
      ...recurringPatch,
      ...allocPart,
    };

    try {
      const res = await fetch(editing.id ? `/api/income-invoices/${editing.id}` : "/api/income-invoices", {
        method: editing.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      onSaved();
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function refreshPaymentsForInvoice(id: string) {
    const res = await fetch(`/api/income-invoices/${id}`);
    const row = await res.json();
    if (!res.ok) return;
    setEditing((prev) => {
      if (prev.id !== id) return prev;
      plannedIncomeManualRef.current = isoToDateInputValue(row.plannedIncomeDate) !== isoToDateInputValue(row.paymentDueDate);
      return {
        ...prev,
        ...row,
        isGeneratedFromRecurring: !!row.isGeneratedFromRecurring,
        isRecurringDetached: !!row.isRecurringDetached,
        incomeCategoryId: row.incomeCategoryId ?? null,
        vatRate: row.vatRate ?? prev.vatRate,
        issueDate: isoToDateInputValue(row.issueDate),
        paymentDueDate: isoToDateInputValue(row.paymentDueDate),
        plannedIncomeDate: isoToDateInputValue(row.plannedIncomeDate),
        actualIncomeDate: row.actualIncomeDate ? isoToDateInputValue(row.actualIncomeDate) : null,
        netAmount: String(row.netAmount),
        vatAmount: String(row.vatAmount),
        grossAmount: String(row.grossAmount),
        plannedPayments: normalizePlannedFromApi(row.plannedPayments),
      };
    });
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!editing.id) return;
    const paymentDate = toIsoOrNull(payDraft.paymentDate);
    if (!paymentDate) {
      setFormError("Ustaw datę wpłaty.");
      return;
    }
    const amountGross = normalizeDecimalInput(payDraft.amountGross);
    const body: Record<string, unknown> = {
      amountGross,
      paymentDate,
      notes: payDraft.notes,
    };
    if (editing.vatDestination === "VAT" && !incomeInvoiceMultiProject(editing)) {
      body.allocatedMainAmount = normalizeDecimalInput(paySplitMain.trim() || "0");
      body.allocatedVatAmount = normalizeDecimalInput(paySplitVat.trim() || "0");
    }
    if (incomeInvoiceMultiProject(editing) && payProjectRows.length > 0) {
      body.projectAllocations = payProjectRows.map((row) => ({
        projectId: row.projectId,
        grossAmount: normalizeDecimalInput(row.grossAmount),
        description: "",
      }));
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/income-invoices/${editing.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      setPayOpen(false);
      setPayDraft({ amountGross: "", paymentDate: "", notes: "" });
      setPayProjectRows([]);
      setPayProjectManual(false);
      setPaySplitMain("");
      setPaySplitVat("");
      await refreshPaymentsForInvoice(editing.id);
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(paymentId: string) {
    if (!editing.id) return;
    if (!confirm("Usunąć tę wpłatę?")) return;
    const res = await fetch(`/api/income-invoices/${editing.id}/payments/${paymentId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    await refreshPaymentsForInvoice(editing.id);
  }

  async function deleteInvoice(invoiceId: string) {
    const res = await fetch(`/api/income-invoices/${invoiceId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    onSaved();
  }

  async function savePaymentPlan() {
    if (!editing.id) return;
    setSaving(true);
    setFormError(null);
    const rows = editing.plannedPayments ?? [];
    for (const row of rows) {
      if (!String(row.dueDate ?? "").trim()) {
        setFormError("Uzupełnij termin (datę) w każdym wierszu planu wpłat.");
        setSaving(false);
        return;
      }
    }
    const payload = {
      rows: rows.map((row, i) => ({
        dueDate: `${row.dueDate}T12:00:00.000Z`,
        plannedMainAmount: normalizeDecimalInput(row.plannedMainAmount || "0"),
        plannedVatAmount: normalizeDecimalInput(row.plannedVatAmount || "0"),
        note: row.note.trim(),
        sortOrder: i,
        status: row.status || "PLANNED",
      })),
    };
    try {
      const res = await fetch(`/api/income-invoices/${editing.id}/payment-plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      await refreshPaymentsForInvoice(editing.id);
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  function applyPlanQuickFill(mode: "vat" | "main" | "rest") {
    setEditing((prev) => {
      const rows = [...(prev.plannedPayments ?? [])];
      if (rows.length === 0) rows.push(newPlanRow(0));
      const idx = Math.min(Math.max(0, planRowFocusIdxRef.current), rows.length - 1);
      const invNet = round2(Number(normalizeDecimalInput(prev.netAmount || "0")));
      const invVat = round2(Number(normalizeDecimalInput(prev.vatAmount || "0")));
      let otherMain = 0;
      let otherVat = 0;
      for (let i = 0; i < rows.length; i++) {
        if (i === idx) continue;
        otherMain = round2(otherMain + Number(normalizeDecimalInput(rows[i].plannedMainAmount || "0")));
        otherVat = round2(otherVat + Number(normalizeDecimalInput(rows[i].plannedVatAmount || "0")));
      }
      const current = { ...rows[idx] };
      if (mode === "vat") current.plannedVatAmount = round2(Math.max(0, invVat - otherVat)).toFixed(2);
      else if (mode === "main") current.plannedMainAmount = round2(Math.max(0, invNet - otherMain)).toFixed(2);
      else {
        current.plannedMainAmount = round2(Math.max(0, invNet - otherMain)).toFixed(2);
        current.plannedVatAmount = round2(Math.max(0, invVat - otherVat)).toFixed(2);
      }
      rows[idx] = current;
      return { ...prev, plannedPayments: rows.map((row, i) => ({ ...row, sortOrder: i })) };
    });
  }

  return (
    <IncomeInvoiceFormModal
      open={open}
      editing={editing}
      setEditing={setEditing}
      formError={formError}
      setFormError={setFormError}
      pdfDraftNote={pdfDraftNote}
      saving={saving}
      categories={categories}
      projects={projects}
      closeModal={closeModal}
      save={save}
      applyIncomePdfDraft={applyIncomePdfDraft}
      projectAllocMode={projectAllocMode}
      setProjectAllocMode={setProjectAllocMode}
      projectAllocRows={projectAllocRows}
      setProjectAllocRows={setProjectAllocRows}
      amountEntryMode={amountEntryMode}
      handleAmountModeChange={handleAmountModeChange}
      applyPaymentDue={applyPaymentDue}
      plannedIncomeManualRef={plannedIncomeManualRef}
      planSaving={saving}
      newPlanRow={newPlanRow}
      savePaymentPlan={savePaymentPlan}
      applyPlanQuickFill={applyPlanQuickFill}
      planRowFocusIdxRef={planRowFocusIdxRef}
      payOpen={payOpen}
      setPayOpen={setPayOpen}
      submitPayment={submitPayment}
      payDraft={payDraft}
      setPayDraft={setPayDraft}
      paySaving={saving}
      payProjectManual={payProjectManual}
      setPayProjectManual={setPayProjectManual}
      payProjectRows={payProjectRows}
      setPayProjectRows={setPayProjectRows}
      paySplitMain={paySplitMain}
      setPaySplitMain={setPaySplitMain}
      paySplitVat={paySplitVat}
      setPaySplitVat={setPaySplitVat}
      todayYmd={todayYmd}
      prefillIncomePaymentCashflowSplit={prefillIncomePaymentCashflowSplit}
      prefillIncomePaymentProjectRows={prefillIncomePaymentProjectRows}
      incomeInvoiceMultiProject={incomeInvoiceMultiProject}
      deletePayment={deletePayment}
      deleteInvoice={deleteInvoice}
      overlayZIndexClass={overlayZIndexClass}
    />
  );
}
