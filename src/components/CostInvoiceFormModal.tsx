"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Dispatch, FormEvent, MutableRefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectSearchPicker } from "@/components/ProjectSearchPicker";
import { ExpenseCategorySearchPicker } from "@/components/ExpenseCategorySearchPicker";
import { VehicleSearchPicker } from "@/components/VehicleSearchPicker";
import {
  account5FromPlaceKind,
  account5FromProjectCode,
  COST_PLACE_KINDS,
  costPlaceKindLabel,
  type CostPlaceKind,
} from "@/lib/accounting/account-codes";
import { formatVehicleLabel } from "@/lib/accounting/vehicle-label";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import {
  Account5MultiCopyActions,
  Account5SingleCopyLine,
} from "@/components/Account5CopyActions";
import { buildAccount5AllocationsFromFormRows } from "@/lib/accounting/account5-clipboard";
import { formatDate, formatMoney, toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { amountsFromNetRate, inferVatRateFromAmounts, type VatRatePct } from "@/lib/vat-rate";
import { ContractorAutocomplete } from "@/components/ContractorAutocomplete";
import { readApiErrorBody } from "@/lib/api-client";
import type { CostInvoice, CostInvoicePayment } from "@prisma/client";
import { costRemainingGross, sumCostPaymentsGross } from "@/lib/cashflow/settlement";
import {
  costAdditionalChargesGross,
  costEffectivePaymentGross,
  costHasPaymentAmountSplit,
} from "@/lib/cashflow/cost-payment-amount";
import { DueDateOffsetControls } from "@/components/DueDateOffsetControls";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { isStoredVatOnlyCost } from "@/lib/validation/is-vat-only-cost";
import { documentGrossSlicesFromInvoice } from "@/lib/payment-project-allocation/distribute-read";
import { defaultProportionalPaymentAllocationRows } from "@/lib/payment-project-allocation/default-rows";
import { InvoicePdfDraftSection } from "@/components/InvoicePdfDraftSection";
import type { InvoicePdfDraftResponse } from "@/lib/invoice-pdf/types";
import type { PostCreateReturnCapture } from "@/lib/safe-internal-return-path";
import {
  allocationAmountsFromGross,
  allocationAmountsFromNet,
  allocationTotals,
  fillAllocationRemainder,
  formatMoneyString,
  isManualVatRate,
  parseMoneyString,
  type AllocationVatRateCode,
} from "@/lib/money/allocation-balancing";
import { buildCostInvoiceDraftFromKsef } from "@/lib/ksef/build-cost-invoice-draft-from-ksef";
import type { KsefImportCostBody } from "@/lib/validation/ksef-import-schemas";

type PayPick = Pick<CostInvoicePayment, "amountGross">;

type ProjectOption = { id: string; name: string; isActive: boolean; code?: string | null };

type VehicleOption = {
  id: string;
  registrationNumber: string;
  make?: string | null;
  model?: string | null;
  name?: string | null;
  isActive?: boolean;
};

export type CostInvoiceRow = {
  id: string;
  documentNumber: string;
  supplier: string;
  description: string;
  vatRate: number;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  amountToPayGross?: string | null;
  documentDate?: string | null;
  paymentDueDate?: string | null;
  plannedPaymentDate?: string | null;
  status: string;
  paid: boolean;
  actualPaymentDate: string | null;
  paymentSource: string;
  notes: string;
  costPlaceKind?: string;
  account5Code?: string | null;
  accountingNote?: string;
  vehicleId?: string | null;
  vehicle?: {
    id: string;
    registrationNumber: string;
    make?: string | null;
    model?: string | null;
    name?: string | null;
  } | null;
  expenseCategoryId?: string | null;
  expenseCategory?: {
    id: string;
    name: string;
    slug: string;
    accountingCode?: string | null;
    accountingName?: string | null;
  } | null;
  payments?: {
    id: string;
    amountGross: string;
    paymentDate: string;
    notes: string;
    bankTransactionId?: string | null;
    projectAllocations?: { projectId: string; grossAmount: unknown; project?: { id: string; name: string } | null }[];
  }[];
  isGeneratedFromRecurring?: boolean;
  isRecurringDetached?: boolean;
  projectId?: string | null;
  project?: { id: string; name: string; code?: string | null } | null;
  projectName?: string | null;
  projectAllocations?: {
    id: string;
    projectId: string;
    netAmount: unknown;
    grossAmount: unknown;
    description: string;
    account5Code?: string | null;
    project?: { id: string; name: string; code?: string | null } | null;
  }[];
};

export type Draft = Omit<CostInvoiceRow, "id"> & { id?: string };

type Row = CostInvoiceRow;

type ProjectAllocRow = {
  projectId: string;
  netAmount: string;
  grossAmount: string;
  description: string;
  vatRateCode: AllocationVatRateCode;
};

type CostAmountEntryMode = "net" | "gross" | "netVat";
type CostAmountVatRateCode = Exclude<AllocationVatRateCode, "MANUAL">;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyDraft(): Draft {
  const { vatAmount, grossAmount } = amountsFromNetRate("0", 23);
  return {
    documentNumber: "",
    supplier: "",
    description: "",
    vatRate: 23,
    netAmount: "0",
    vatAmount,
    grossAmount,
    documentDate: todayYmd(),
    paymentDueDate: todayYmd(),
    plannedPaymentDate: todayYmd(),
    status: "PLANOWANA",
    paid: false,
    actualPaymentDate: null,
    paymentSource: "MAIN",
    notes: "",
    expenseCategoryId: null,
    projectId: null,
    costPlaceKind: "UNCLASSIFIED",
    accountingNote: "",
    vehicleId: null,
  };
}

function paymentSourceLabel(src: string) {
  if (src === "VAT_THEN_MAIN") return "VAT → MAIN";
  return src === "MAIN" ? "MAIN" : "VAT";
}

function statusBadge(s: string) {
  if (s === "ZAPLACONA") return <Badge variant="success">Zapłacona</Badge>;
  if (s === "PARTIALLY_PAID") return <Badge variant="warning">Częściowo</Badge>;
  if (s === "DO_ZAPLATY") return <Badge variant="warning">Do zapłaty</Badge>;
  return <Badge variant="muted">Planowana</Badge>;
}

function CostPaymentAmountHint({
  grossAmount,
  amountToPayGross,
}: {
  grossAmount: string;
  amountToPayGross?: string | null;
}) {
  const inv = { grossAmount, amountToPayGross: amountToPayGross ?? null };
  if (!costHasPaymentAmountSplit(inv)) return null;
  const charges = costAdditionalChargesGross(inv);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
      <p>Kwota faktury: {formatMoney(grossAmount)}</p>
      {charges != null ? <p>Dodatkowe obciążenia: {formatMoney(charges)}</p> : null}
      <p className="font-semibold">Do zapłaty: {formatMoney(costEffectivePaymentGross(inv))}</p>
    </div>
  );
}

type Cat = {
  id: string;
  name: string;
  slug: string;
  isActive?: boolean;
  accountingCode?: string | null;
  accountingName?: string | null;
};

function costInvoiceMultiProject(editing: Pick<Draft, "projectAllocations" | "projectId">): boolean {
  return (editing.projectAllocations?.length ?? 0) > 1;
}

function defaultCostAllocationVatRateCode(editing: Pick<Draft, "vatRate" | "netAmount" | "vatAmount">): AllocationVatRateCode {
  if (isStoredVatOnlyCost(editing.netAmount, editing.vatAmount)) return "MANUAL";
  if (editing.vatRate === 23 || editing.vatRate === 8 || editing.vatRate === 5 || editing.vatRate === 0) {
    return String(editing.vatRate) as AllocationVatRateCode;
  }
  return "23";
}

function storedVatRateFromCode(code: CostAmountVatRateCode | AllocationVatRateCode): VatRatePct {
  if (code === "23" || code === "8" || code === "5" || code === "0") return Number(code) as VatRatePct;
  return 0;
}

function costAmountRateCodeFromInvoice(editing: Pick<Draft, "vatRate" | "netAmount" | "vatAmount">): CostAmountVatRateCode {
  if (editing.vatRate === 23 || editing.vatRate === 8 || editing.vatRate === 5 || editing.vatRate === 0) {
    return String(editing.vatRate) as CostAmountVatRateCode;
  }
  return "23";
}

function costAmountModeFromInvoice(editing: Pick<Draft, "vatRate" | "netAmount" | "vatAmount" | "grossAmount">): CostAmountEntryMode {
  if (isStoredVatOnlyCost(editing.netAmount, editing.vatAmount)) return "netVat";
  const rateCode = costAmountRateCodeFromInvoice(editing);
  const expected = allocationAmountsFromNet(String(editing.netAmount), rateCode);
  const expectedVat = formatMoneyString(parseMoneyString(expected.grossAmount) - parseMoneyString(String(editing.netAmount)));
  const actualVat = formatMoneyString(parseMoneyString(String(editing.vatAmount)));
  const actualGross = formatMoneyString(parseMoneyString(String(editing.grossAmount)));
  return expectedVat === actualVat && expected.grossAmount === actualGross ? "net" : "netVat";
}

function costInvoiceAmountsFromNet(net: string, vatRateCode: CostAmountVatRateCode) {
  const amounts = allocationAmountsFromNet(net, vatRateCode);
  const vatAmount = formatMoneyString(parseMoneyString(amounts.grossAmount) - parseMoneyString(amounts.netAmount));
  return { netAmount: net, vatAmount, grossAmount: amounts.grossAmount };
}

function costInvoiceAmountsFromGross(gross: string, vatRateCode: CostAmountVatRateCode) {
  const amounts = allocationAmountsFromGross(gross, vatRateCode);
  const vatAmount = formatMoneyString(parseMoneyString(gross) - parseMoneyString(amounts.netAmount));
  return { netAmount: amounts.netAmount, vatAmount, grossAmount: gross };
}

function costInvoiceAmountsFromNetVat(net: string, vat: string) {
  return {
    netAmount: net,
    vatAmount: vat,
    grossAmount: formatMoneyString(parseMoneyString(net) + parseMoneyString(vat)),
  };
}

export function costInvoicePrefillFromPlannedEvent(ev: { amount?: unknown; amountVat?: unknown }): {
  amountEntryMode: CostAmountEntryMode;
  costAmountVatRateCode: CostAmountVatRateCode;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  vatRate: VatRatePct;
} {
  const net = formatMoneyString(parseMoneyString(String(ev.amount ?? "0")));
  const vat = formatMoneyString(parseMoneyString(String(ev.amountVat ?? "0")));
  const amounts = costInvoiceAmountsFromNetVat(net, vat);
  return {
    amountEntryMode: "netVat",
    costAmountVatRateCode: "0",
    ...amounts,
    vatRate: 0,
  };
}

function newCostAllocationRow(params: {
  projectId?: string | null;
  netAmount: string;
  grossAmount: string;
  description?: string;
  vatRateCode: AllocationVatRateCode;
}): ProjectAllocRow {
  return {
    projectId: params.projectId ?? "",
    netAmount: params.netAmount,
    grossAmount: params.grossAmount,
    description: params.description ?? "",
    vatRateCode: params.vatRateCode,
  };
}

function prefillPaymentProjectRows(editing: Draft, amountGrossStr: string) {
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

type CostInvoiceFormModalProps = {
  open: boolean;
  editing: Draft;
  setEditing: Dispatch<SetStateAction<Draft>>;
  formError: string | null;
  setFormError: Dispatch<SetStateAction<string | null>>;
  pdfDraftNote: string | null;
  saving: boolean;
  categories: Cat[];
  projects: ProjectOption[];
  vehicles: VehicleOption[];
  categoriesForForm: Cat[];
  editCostPlaceKind: CostPlaceKind;
  editAccount5Preview: string | null;
  editAccount5CopyAllocs: ReturnType<typeof buildAccount5AllocationsFromFormRows> | null;
  closeModal: () => void;
  save: (e: FormEvent) => Promise<void>;
  applyCostPdfDraft: (res: InvoicePdfDraftResponse) => void;
  amountEntryMode: CostAmountEntryMode;
  setAmountEntryMode: Dispatch<SetStateAction<CostAmountEntryMode>>;
  costAmountVatRateCode: CostAmountVatRateCode;
  setCostAmountVatRateCode: Dispatch<SetStateAction<CostAmountVatRateCode>>;
  vatOnlyPayment: boolean;
  setVatOnlyPayment: Dispatch<SetStateAction<boolean>>;
  handleAmountModeChange: (m: CostAmountEntryMode) => void;
  handleCostAmountVatRateChange: (vatRateCode: CostAmountVatRateCode) => void;
  projectAllocMode: "simple" | "multi";
  setProjectAllocMode: Dispatch<SetStateAction<"simple" | "multi">>;
  projectAllocRows: ProjectAllocRow[];
  setProjectAllocRows: Dispatch<SetStateAction<ProjectAllocRow[]>>;
  projectAllocationTotals: ReturnType<typeof allocationTotals>;
  vehicleApplies: boolean;
  setVehicleApplies: Dispatch<SetStateAction<boolean>>;
  plannedPaymentManualRef: MutableRefObject<boolean>;
  applyPaymentDue: (dueYmd: string) => void;
  payOpen: boolean;
  setPayOpen: Dispatch<SetStateAction<boolean>>;
  submitPayment: (e: FormEvent) => Promise<void>;
  payDraft: { amountGross: string; paymentDate: string; notes: string };
  setPayDraft: Dispatch<SetStateAction<{ amountGross: string; paymentDate: string; notes: string }>>;
  paySaving: boolean;
  payProjectManual: boolean;
  setPayProjectManual: Dispatch<SetStateAction<boolean>>;
  payProjectRows: { projectId: string; grossAmount: string }[];
  setPayProjectRows: Dispatch<SetStateAction<{ projectId: string; grossAmount: string }[]>>;
  deletePayment: (pid: string) => Promise<void>;
  removeFromEdit: () => Promise<void>;
  overlayZIndexClass?: string;
  modalTitle?: string;
};

export function CostInvoiceFormModal(props: CostInvoiceFormModalProps) {
  const {
    open,
    editing,
    setEditing,
    formError,
    setFormError,
    pdfDraftNote,
    saving,
    categories,
    projects,
    categoriesForForm,
    editCostPlaceKind,
    editAccount5Preview,
    editAccount5CopyAllocs,
    closeModal,
    save,
    applyCostPdfDraft,
    amountEntryMode,
    setAmountEntryMode,
    costAmountVatRateCode,
    setCostAmountVatRateCode,
    vatOnlyPayment,
    setVatOnlyPayment,
    handleAmountModeChange,
    handleCostAmountVatRateChange,
    projectAllocMode,
    setProjectAllocMode,
    projectAllocRows,
    setProjectAllocRows,
    projectAllocationTotals,
    vehicleApplies,
    setVehicleApplies,
    plannedPaymentManualRef,
    applyPaymentDue,
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
    deletePayment,
    removeFromEdit,
    overlayZIndexClass = "z-50",
    modalTitle,
  } = props;

  return (
    <>
      <Modal
        open={open}
        title={modalTitle ?? (editing.id ? "Edycja faktury kosztowej" : "Nowa faktura kosztowa")}
        onClose={closeModal}
        size="lg"
        overlayZIndexClass={overlayZIndexClass}
      >
        <form onSubmit={save} className="max-h-[75vh] space-y-3 overflow-y-auto pr-1">
          {formError && <Alert variant="error">{formError}</Alert>}
          <CostPaymentAmountHint
            grossAmount={editing.grossAmount}
            amountToPayGross={editing.amountToPayGross}
          />
          {pdfDraftNote ? (
            <Alert variant="info">
              <p className="whitespace-pre-wrap text-sm">{pdfDraftNote}</p>
            </Alert>
          ) : null}
          <InvoicePdfDraftSection kind="cost" disabled={saving} onDraft={applyCostPdfDraft} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Numer dokumentu">
              <Input
                value={editing.documentNumber}
                onChange={(e) => setEditing({ ...editing, documentNumber: e.target.value })}
                required
                disabled={saving}
              />
            </Field>
            <Field label="Dostawca">
              <ContractorAutocomplete
                value={editing.supplier}
                onChange={(supplier) => setEditing({ ...editing, supplier })}
                required
                disabled={saving}
                placeholder="Wpisz lub wybierz dostawcę z katalogu"
              />
            </Field>
          </div>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Klasyfikacja księgowa</p>
            <div className="space-y-3">
              <Field label="Miejsce kosztu (konto 5)">
                <Select
                  value={editCostPlaceKind}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      costPlaceKind: e.target.value,
                    })
                  }
                  disabled={saving}
                >
                  {COST_PLACE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {costPlaceKindLabel(k)}
                    </option>
                  ))}
                </Select>
              </Field>
              {editCostPlaceKind === "UNCLASSIFIED" ? (
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Wybierz miejsce kosztu: projekt (501), koszty ogólne (502-01) lub koszty zarządu (550-01).
                </p>
              ) : null}
              {editCostPlaceKind === "GENERAL_502" || editCostPlaceKind === "MANAGEMENT_550" ? (
                <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                  Konto 5: {account5FromPlaceKind(editCostPlaceKind)}
                </p>
              ) : null}
              <Field label="Kategoria kosztu (konto 4)">
                <ExpenseCategorySearchPicker
                  categories={categoriesForForm}
                  value={editing.expenseCategoryId ?? null}
                  onChange={(id) => setEditing({ ...editing, expenseCategoryId: id })}
                  disabled={saving}
                />
              </Field>
              <Field label="Notatka księgowa">
                <Input
                  value={editing.accountingNote ?? ""}
                  onChange={(e) => setEditing({ ...editing, accountingNote: e.target.value })}
                  placeholder="np. uzasadnienie klasyfikacji"
                  disabled={saving}
                />
              </Field>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input
                  type="checkbox"
                  className="size-4 rounded border-zinc-300"
                  checked={vehicleApplies}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setVehicleApplies(on);
                    if (!on) setEditing({ ...editing, vehicleId: null, vehicle: null });
                  }}
                  disabled={saving}
                />
                Koszt dotyczy pojazdu
              </label>
              {vehicleApplies ? (
                <Field label="Pojazd">
                  <VehicleSearchPicker
                    value={editing.vehicleId ?? null}
                    onChange={(id) => setEditing({ ...editing, vehicleId: id })}
                    disabled={saving}
                  />
                </Field>
              ) : null}
              {editAccount5Preview || editAccount5CopyAllocs ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                  {editAccount5CopyAllocs ? (
                    <>
                      <p className="mb-1">
                        Podgląd konta 5:{" "}
                        <span className="font-semibold">{editAccount5CopyAllocs.length} projektów</span>
                      </p>
                      <Account5MultiCopyActions allocs={editAccount5CopyAllocs} compactCodes />
                    </>
                  ) : editAccount5Preview ? (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Podgląd konta 5:</span>
                      <Account5SingleCopyLine code={editAccount5Preview} className="font-semibold" />
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <Field label="Opis">
            <Textarea
              rows={2}
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              disabled={saving}
            />
          </Field>
          <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            {editCostPlaceKind === "PROJECT" ? (
              <>
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
                      const vatRateCode = defaultCostAllocationVatRateCode(editing);
                      if (pid) {
                        return [
                          newCostAllocationRow({
                            projectId: pid,
                            netAmount: editing.netAmount,
                            grossAmount: editing.grossAmount,
                            vatRateCode,
                          }),
                        ];
                      }
                      return [
                        newCostAllocationRow({
                          projectId: "",
                          netAmount: editing.netAmount,
                          grossAmount: editing.grossAmount,
                          vatRateCode,
                        }),
                      ];
                    });
                  } else {
                    setProjectAllocRows([]);
                  }
                }}
              />
              Alokacja na kilka projektów (suma netto i brutto = dokument)
            </label>
            {projectAllocMode === "multi" ? (
              <div className="mt-3 w-full space-y-2">
                <div
                  className={`rounded-md border p-2 text-xs ${
                    projectAllocationTotals.netOver || projectAllocationTotals.grossOver
                      ? "border-red-300 bg-red-50/80 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
                      : projectAllocationTotals.netOk && projectAllocationTotals.grossOk
                        ? "border-emerald-200 bg-emerald-50/70 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
                        : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                  }`}
                >
                  <div className="grid gap-1 sm:grid-cols-2">
                    <div>
                      <span className="font-medium">Netto:</span> Dokument:{" "}
                      <strong className="tabular-nums">{formatMoney(projectAllocationTotals.documentNet)}</strong> ·
                      Przydzielono:{" "}
                      <strong className="tabular-nums">{formatMoney(projectAllocationTotals.allocatedNet)}</strong> ·
                      Pozostało:{" "}
                      <strong className="tabular-nums">{formatMoney(projectAllocationTotals.remainingNet)}</strong>
                    </div>
                    <div>
                      <span className="font-medium">Brutto:</span> Dokument:{" "}
                      <strong className="tabular-nums">{formatMoney(projectAllocationTotals.documentGross)}</strong> ·
                      Przydzielono:{" "}
                      <strong className="tabular-nums">{formatMoney(projectAllocationTotals.allocatedGross)}</strong> ·
                      Pozostało:{" "}
                      <strong className="tabular-nums">{formatMoney(projectAllocationTotals.remainingGross)}</strong>
                    </div>
                  </div>
                  {projectAllocationTotals.netOver || projectAllocationTotals.grossOver ? (
                    <p className="mt-1 font-medium">Przekroczono kwotę dokumentu — skoryguj alokacje przed zapisem.</p>
                  ) : projectAllocationTotals.netOk && projectAllocationTotals.grossOk ? (
                    <p className="mt-1 font-medium">OK — suma netto i brutto zgadza się z dokumentem.</p>
                  ) : null}
                </div>
                {projectAllocRows.map((row, idx) => (
                  <div
                    key={idx}
                    className="grid w-full gap-2 rounded-md border border-zinc-100 p-2 dark:border-zinc-800 grid-cols-1 sm:grid-cols-2 xl:grid-cols-6"
                  >
                    <Field label="Projekt">
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
                      {(() => {
                        const p = projects.find((x) => x.id === row.projectId);
                        const a5 = account5FromProjectCode(p?.code);
                        return a5 ? (
                          <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">Konto 5: {a5}</p>
                        ) : null;
                      })()}
                    </Field>
                    <Field label="Stawka VAT">
                      <Select
                        value={row.vatRateCode}
                        onChange={(e) => {
                          const vatRateCode = e.target.value as AllocationVatRateCode;
                          setProjectAllocRows((rows) =>
                            rows.map((x, i) => {
                              if (i !== idx) return x;
                              if (isManualVatRate(vatRateCode)) return { ...x, vatRateCode };
                              const amounts = allocationAmountsFromNet(x.netAmount, vatRateCode);
                              return { ...x, vatRateCode, grossAmount: amounts.grossAmount };
                            }),
                          );
                        }}
                        disabled={saving}
                      >
                        <option value="23">23%</option>
                        <option value="8">8%</option>
                        <option value="5">5%</option>
                        <option value="0">0%</option>
                        <option value="ZW">ZW</option>
                        <option value="NP">NP</option>
                        <option value="MANUAL">Ręcznie</option>
                      </Select>
                    </Field>
                    <Field label="Netto (alokacja)">
                      <Input
                        value={row.netAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) =>
                            rows.map((x, i) => {
                              if (i !== idx) return x;
                              if (isManualVatRate(x.vatRateCode)) return { ...x, netAmount: v };
                              const amounts = allocationAmountsFromNet(v, x.vatRateCode);
                              return { ...x, netAmount: v, grossAmount: amounts.grossAmount };
                            }),
                          );
                        }}
                        disabled={saving}
                        inputMode="decimal"
                        autoComplete="off"
                      />
                    </Field>
                    <Field label="Brutto (alokacja)">
                      <Input
                        value={row.grossAmount}
                        onChange={(e) => {
                          const v = e.target.value;
                          setProjectAllocRows((rows) =>
                            rows.map((x, i) => {
                              if (i !== idx) return x;
                              if (isManualVatRate(x.vatRateCode)) return { ...x, grossAmount: v };
                              const amounts = allocationAmountsFromGross(v, x.vatRateCode);
                              return { ...x, grossAmount: v, netAmount: amounts.netAmount };
                            }),
                          );
                        }}
                        disabled={saving}
                        inputMode="decimal"
                        autoComplete="off"
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
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full !px-2 !py-2 !text-xs"
                        disabled={saving}
                        onClick={() =>
                          setProjectAllocRows((rows) =>
                            rows.map((x, i) => {
                              if (i !== idx) return x;
                              const filled = fillAllocationRemainder({
                                documentNet: editing.netAmount,
                                documentGross: editing.grossAmount,
                                rows,
                                rowIndex: idx,
                                vatRateCode: x.vatRateCode,
                              });
                              return { ...x, ...filled };
                            }),
                          )
                        }
                      >
                        Uzupełnij pozostałą kwotę
                      </Button>
                    </div>
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
                        newCostAllocationRow({
                          projectId: "",
                          netAmount: editing.netAmount,
                          grossAmount: editing.grossAmount,
                          vatRateCode: defaultCostAllocationVatRateCode(editing),
                        }),
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
              <Field label="Projekt">
                <ProjectSearchPicker
                  value={editing.projectId ?? null}
                  onChange={(id) => setEditing({ ...editing, projectId: id })}
                  disabled={saving}
                />
                {(() => {
                  const p = projects.find((x) => x.id === editing.projectId) ?? editing.project;
                  const a5 = account5FromProjectCode(p?.code);
                  return a5 ? (
                    <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">Konto 5: {a5}</p>
                  ) : null;
                })()}
                {!editing.projectId && (editing.projectName ?? "").trim() ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                    Legacy: „{(editing.projectName ?? "").trim()}” — wybierz projekt z listy, aby powiązać rekord.
                  </p>
                ) : null}
              </Field>
            )}
              </>
            ) : (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Alokacja projektowa dostępna po wyborze miejsca kosztu „Projekt / zlecenie (501)”.
              </p>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              className="size-4 rounded border-zinc-300"
              checked={vatOnlyPayment}
              onChange={(e) => {
                const on = e.target.checked;
                setVatOnlyPayment(on);
                if (on) {
                  setAmountEntryMode("net");
                  setCostAmountVatRateCode("0");
                  setEditing((prev) => {
                    const raw = prev.vatAmount?.trim();
                    const hasVat = raw && Number(normalizeDecimalInput(raw)) > 0;
                    const vatStr = hasVat ? normalizeDecimalInput(raw!) : "";
                    return {
                      ...prev,
                      netAmount: "0",
                      vatRate: 0,
                      vatAmount: vatStr,
                      grossAmount: vatStr,
                      paymentSource: prev.paymentSource === "MAIN" ? "VAT" : prev.paymentSource,
                    };
                  });
                } else {
                  setAmountEntryMode("net");
                  setCostAmountVatRateCode("23");
                  setEditing((prev) => {
                    const net =
                      prev.netAmount && Number(normalizeDecimalInput(prev.netAmount)) > 0
                        ? prev.netAmount
                        : "1";
                    const a = costInvoiceAmountsFromNet(net, "23");
                    return { ...prev, ...a, vatRate: 23 };
                  });
                }
              }}
              disabled={saving}
            />
            Płatność tylko VAT (netto 0, brutto = kwota VAT — np. zapłata samego VAT z konta VAT)
          </label>
          {vatOnlyPayment ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Kwota netto">
                <Input value="0" readOnly disabled className="bg-zinc-50 dark:bg-zinc-900" />
              </Field>
              <Field label="Stawka VAT">
                <Select value="0" disabled>
                  <option value="0">0% (tryb tylko VAT)</option>
                </Select>
              </Field>
              <Field label="Kwota VAT">
                <Input
                  value={editing.vatAmount}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEditing((prev) => ({ ...prev, vatAmount: v, grossAmount: v }));
                  }}
                  required
                  disabled={saving}
                  inputMode="decimal"
                  autoComplete="off"
                />
              </Field>
              <Field label="Brutto">
                <Input
                  readOnly
                  className="bg-zinc-50 dark:bg-zinc-900"
                  value={editing.grossAmount}
                  disabled={saving}
                />
              </Field>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="costInvoiceAmountMode"
                    className="size-4"
                    checked={amountEntryMode === "net"}
                    onChange={() => handleAmountModeChange("net")}
                    disabled={saving}
                  />
                  Wpisuję netto
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="costInvoiceAmountMode"
                    className="size-4"
                    checked={amountEntryMode === "gross"}
                    onChange={() => handleAmountModeChange("gross")}
                    disabled={saving}
                  />
                  Wpisuję brutto
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="costInvoiceAmountMode"
                    className="size-4"
                    checked={amountEntryMode === "netVat"}
                    onChange={() => handleAmountModeChange("netVat")}
                    disabled={saving}
                  />
                  Wpisuję netto + VAT ręcznie
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Kwota netto">
                  <Input
                    value={editing.netAmount}
                    onChange={(e) => {
                      const net = e.target.value;
                      setEditing((prev) => {
                        if (amountEntryMode === "netVat") return { ...prev, ...costInvoiceAmountsFromNetVat(net, prev.vatAmount) };
                        const a = costInvoiceAmountsFromNet(net, costAmountVatRateCode);
                        return { ...prev, ...a, vatRate: storedVatRateFromCode(costAmountVatRateCode) };
                      });
                    }}
                    required
                    disabled={saving}
                    readOnly={amountEntryMode === "gross"}
                    className={amountEntryMode === "gross" ? "bg-zinc-50 dark:bg-zinc-900" : undefined}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Stawka VAT">
                  {amountEntryMode === "netVat" ? (
                    <Input value="Ręcznie" readOnly disabled className="bg-zinc-50 dark:bg-zinc-900" />
                  ) : (
                    <Select
                      value={costAmountVatRateCode}
                      onChange={(e) => handleCostAmountVatRateChange(e.target.value as CostAmountVatRateCode)}
                      disabled={saving}
                    >
                      <option value="23">23%</option>
                      <option value="8">8%</option>
                      <option value="5">5%</option>
                      <option value="0">0%</option>
                      <option value="ZW">ZW</option>
                      <option value="NP">NP</option>
                    </Select>
                  )}
                </Field>
                <Field label="Kwota VAT">
                  <Input
                    value={editing.vatAmount}
                    onChange={(e) => {
                      const vat = e.target.value;
                      setEditing((prev) => ({ ...prev, ...costInvoiceAmountsFromNetVat(prev.netAmount, vat) }));
                    }}
                    required
                    disabled={saving}
                    readOnly={amountEntryMode !== "netVat"}
                    className={amountEntryMode !== "netVat" ? "bg-zinc-50 dark:bg-zinc-900" : undefined}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Brutto">
                  <Input
                    value={editing.grossAmount}
                    onChange={(e) => {
                      const gross = e.target.value;
                      setEditing((prev) => {
                        const a = costInvoiceAmountsFromGross(gross, costAmountVatRateCode);
                        return { ...prev, ...a, vatRate: storedVatRateFromCode(costAmountVatRateCode) };
                      });
                    }}
                    required
                    disabled={saving}
                    readOnly={amountEntryMode !== "gross"}
                    className={amountEntryMode !== "gross" ? "bg-zinc-50 dark:bg-zinc-900" : undefined}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </Field>
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Data dokumentu">
              <Input
                type="date"
                value={editing.documentDate ?? ""}
                onChange={(e) => setEditing({ ...editing, documentDate: e.target.value })}
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
                baseYmd={editing.documentDate ?? ""}
                disabled={saving}
                onApplyDue={applyPaymentDue}
              />
            </Field>
            <Field label="Planowana data zapłaty">
              <Input
                type="date"
                value={editing.plannedPaymentDate ?? ""}
                onChange={(e) => {
                  plannedPaymentManualRef.current = true;
                  setEditing({ ...editing, plannedPaymentDate: e.target.value });
                }}
                required
                disabled={saving}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} disabled={saving}>
                <option value="PLANOWANA">Planowana</option>
                <option value="DO_ZAPLATY">Do zapłaty</option>
                <option value="PARTIALLY_PAID">Częściowo zapłacona</option>
                <option value="ZAPLACONA">Zapłacona</option>
              </Select>
            </Field>
            <Field label="Źródło płatności">
              <Select
                value={editing.paymentSource}
                onChange={(e) => setEditing({ ...editing, paymentSource: e.target.value })}
                disabled={saving}
              >
                <option value="MAIN">Tylko konto główne (MAIN)</option>
                <option value="VAT">Tylko konto VAT</option>
                <option value="VAT_THEN_MAIN">Najpierw VAT (kwota VAT), reszta z MAIN</option>
              </Select>
            </Field>
          </div>
          <Field label="Data faktycznej zapłaty (jeśli zapłacono)">
            <Input
              type="date"
              value={editing.actualPaymentDate ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setEditing({ ...editing, actualPaymentDate: v || null });
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
                Odłącz od reguły cyklicznej — zmiany reguły nie nadpiszą tego dokumentu przy synchronizacji.
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
            <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Płatności (brutto)</span>
                <Button
                  type="button"
                  variant="secondary"
                  className="!py-1.5 !text-xs"
                  onClick={() => {
                    setFormError(null);
                    const invPick = {
                      grossAmount: editing.grossAmount,
                      amountToPayGross: editing.amountToPayGross ?? null,
                    };
                    const pays = (editing.payments ?? []) as unknown as PayPick[];
                    const paymentGross = costEffectivePaymentGross(invPick);
                    const remaining = costRemainingGross(invPick, pays);
                    const amt =
                      remaining > 0 ? String(remaining) : paymentGross > 0 ? String(paymentGross) : "";
                    setPayProjectManual(false);
                    setPayDraft({
                      amountGross: amt,
                      paymentDate: todayYmd(),
                      notes: "",
                    });
                    setPayProjectRows(
                      costInvoiceMultiProject(editing) && amt ? prefillPaymentProjectRows(editing, amt) : [],
                    );
                    setPayOpen(true);
                  }}
                  disabled={saving}
                >
                  Dodaj płatność
                </Button>
              </div>
              <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-400">
                Częściowe lub rozłożone w czasie — dodawaj płatności ręcznie. Pełne rozliczenie możesz ustawić statusem
                „Zapłacona”: brakująca kwota zapisze się tu automatycznie (data z faktycznej zapłaty lub planowanej).
              </p>
              {(() => {
                const invPick = {
                  grossAmount: editing.grossAmount,
                  amountToPayGross: editing.amountToPayGross ?? null,
                };
                const pays = (editing.payments ?? []) as unknown as PayPick[];
                const paymentGross = costEffectivePaymentGross(invPick);
                const invoiceGross = Number(editing.grossAmount) || 0;
                const settled = sumCostPaymentsGross(pays);
                const remaining = costRemainingGross(invPick, pays);
                const pct = paymentGross > 0 ? Math.round((settled / paymentGross) * 1000) / 10 : 0;
                const split = costHasPaymentAmountSplit(invPick);
                const charges = costAdditionalChargesGross(invPick);
                return (
                  <div className="mb-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                    <div>
                      Rozliczono: {formatMoney(settled)} / do zapłaty {formatMoney(paymentGross)} · Pozostało:{" "}
                      {formatMoney(remaining)} · {pct}% do zapłaty
                    </div>
                    {split ? (
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Kwota faktury {formatMoney(invoiceGross)}
                        {charges != null ? ` + obciążenia ${formatMoney(charges)}` : ""}
                      </div>
                    ) : null}
                    <div>
                      Status: {statusBadge(editing.status)} · Kwota faktury: {formatMoney(invoiceGross)}
                    </div>
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
                    {((editing.payments ?? []) as { id: string; amountGross: string; paymentDate: string; notes: string }[])
                      .length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-2 text-zinc-500">
                          Brak płatności
                        </td>
                      </tr>
                    ) : (
                      ((editing.payments ?? []) as { id: string; amountGross: string; paymentDate: string; notes: string }[]).map(
                        (p) => (
                          <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-800">
                            <td className="py-1.5 pr-2 tabular-nums">{formatMoney(Number(p.amountGross))}</td>
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
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <div>
              {editing.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="!text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  disabled={saving}
                  onClick={() => void removeFromEdit()}
                >
                  Usuń dokument
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner className="!size-4" /> : null}
                Zapisz
              </Button>
              <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
                Anuluj
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={payOpen}
        title="Nowa płatność"
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
                if (!payProjectManual && costInvoiceMultiProject(editing) && v.trim()) {
                  setPayProjectRows(prefillPaymentProjectRows(editing, v));
                }
              }}
              required
              disabled={paySaving}
            />
          </Field>
          {costInvoiceMultiProject(editing) && payProjectRows.length > 0 ? (
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
                  setPayProjectRows(prefillPaymentProjectRows(editing, payDraft.amountGross || "0"));
                }}
              >
                Przelicz wg proporcji dokumentu
              </Button>
            </div>
          ) : null}
          <Field label="Data płatności">
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
              Zapisz płatność
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

export function NewCostInvoiceFormModal({
  open,
  mode,
  invoiceId = null,
  ksefDocumentId = null,
  initialDraft,
  sourcePlannedEventId = null,
  postCreateReturn,
  preferMultiProjectAllocation = false,
  onClose,
  onSaved,
  overlayZIndexClass = "z-50",
}: {
  open: boolean;
  mode: "create" | "edit" | "ksef-import";
  invoiceId?: string | null;
  ksefDocumentId?: string | null;
  initialDraft?: Partial<Draft>;
  sourcePlannedEventId?: string | null;
  postCreateReturn?: PostCreateReturnCapture;
  preferMultiProjectAllocation?: boolean;
  onClose: () => void;
  onSaved: (result?: { invoiceId: string }) => void;
  overlayZIndexClass?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfDraftNote, setPdfDraftNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payDraft, setPayDraft] = useState({ amountGross: "", paymentDate: "", notes: "" });
  const [payProjectRows, setPayProjectRows] = useState<{ projectId: string; grossAmount: string }[]>([]);
  const [payProjectManual, setPayProjectManual] = useState(false);
  const [paySaving, setPaySaving] = useState(false);
  const [vehicleApplies, setVehicleApplies] = useState(false);
  const plannedPaymentManualRef = useRef(false);
  const sourcePlannedEventIdRef = useRef<string | null>(null);
  const postCreateReturnRef = useRef<PostCreateReturnCapture>({ returnTo: null, sourceProjectId: null });
  const [amountEntryMode, setAmountEntryMode] = useState<CostAmountEntryMode>("net");
  const [costAmountVatRateCode, setCostAmountVatRateCode] = useState<CostAmountVatRateCode>("23");
  const [vatOnlyPayment, setVatOnlyPayment] = useState(false);
  const [projectAllocMode, setProjectAllocMode] = useState<"simple" | "multi">("simple");
  const [projectAllocRows, setProjectAllocRows] = useState<ProjectAllocRow[]>([]);

  const projectAllocationTotals = useMemo(
    () =>
      allocationTotals({
        documentNet: editing.netAmount,
        documentGross: editing.grossAmount,
        rows: projectAllocRows,
      }),
    [editing.grossAmount, editing.netAmount, projectAllocRows],
  );

  const categoriesForForm = useMemo(() => {
    const sel = editing.expenseCategoryId;
    return categories.filter((c) => c.isActive !== false || c.id === sel);
  }, [categories, editing.expenseCategoryId]);

  const editCostPlaceKind = (editing.costPlaceKind ?? "UNCLASSIFIED") as CostPlaceKind;

  const editAccount5Preview = useMemo(() => {
    if (editing.account5Code?.trim()) return editing.account5Code.trim();
    const fixed = account5FromPlaceKind(editCostPlaceKind);
    if (fixed) return fixed;
    if (editCostPlaceKind === "PROJECT") {
      if (projectAllocMode === "multi") {
        for (const row of projectAllocRows) {
          const p = projects.find((x) => x.id === row.projectId);
          const c = account5FromProjectCode(p?.code);
          if (c) return c;
        }
        return null;
      }
      const p = projects.find((x) => x.id === editing.projectId) ?? editing.project;
      return account5FromProjectCode(p?.code);
    }
    return null;
  }, [editing.account5Code, editing.project, editing.projectId, editCostPlaceKind, projectAllocMode, projectAllocRows, projects]);

  const editAccount5CopyAllocs = useMemo(() => {
    if (editCostPlaceKind !== "PROJECT" || projectAllocMode !== "multi" || projectAllocRows.length <= 1) {
      return null;
    }
    return buildAccount5AllocationsFromFormRows(projectAllocRows, projects, editing.projectAllocations ?? null);
  }, [editCostPlaceKind, projectAllocMode, projectAllocRows, projects, editing.projectAllocations]);

  function applyRowToForm(r: CostInvoiceRow, opts?: { preferMultiProjectAllocation?: boolean }) {
    const vatOnlyRec = isStoredVatOnlyCost(r.netAmount, r.vatAmount);
    setVatOnlyPayment(vatOnlyRec);
    const rate = (
      vatOnlyRec
        ? (r.vatRate as VatRatePct)
        : (r.vatRate ?? inferVatRateFromAmounts(Number(r.netAmount), Number(r.vatAmount)))
    ) as VatRatePct;
    const pp = isoToDateInputValue(r.plannedPaymentDate);
    const pd = isoToDateInputValue(r.paymentDueDate);
    plannedPaymentManualRef.current = pp !== pd;
    setAmountEntryMode(costAmountModeFromInvoice(r));
    setCostAmountVatRateCode(costAmountRateCodeFromInvoice(r));
    setEditing({
      ...r,
      isGeneratedFromRecurring: !!r.isGeneratedFromRecurring,
      isRecurringDetached: !!r.isRecurringDetached,
      vatRate: rate,
      expenseCategoryId: r.expenseCategoryId ?? null,
      costPlaceKind: r.costPlaceKind ?? "UNCLASSIFIED",
      account5Code: r.account5Code ?? null,
      accountingNote: r.accountingNote ?? "",
      vehicleId: r.vehicleId ?? null,
      vehicle: r.vehicle ?? null,
      documentDate: isoToDateInputValue(r.documentDate),
      paymentDueDate: isoToDateInputValue(r.paymentDueDate),
      plannedPaymentDate: isoToDateInputValue(r.plannedPaymentDate),
      actualPaymentDate: r.actualPaymentDate ? isoToDateInputValue(r.actualPaymentDate) : null,
      netAmount: String(r.netAmount),
      vatAmount: String(r.vatAmount),
      grossAmount: String(r.grossAmount),
      amountToPayGross: r.amountToPayGross != null ? String(r.amountToPayGross) : null,
    });
    const pa = r.projectAllocations;
    if (pa && pa.length > 0) {
      setProjectAllocMode("multi");
      setProjectAllocRows(
        pa.map((a) =>
          newCostAllocationRow({
            projectId: a.projectId,
            netAmount: String(a.netAmount),
            grossAmount: String(a.grossAmount),
            description: a.description ?? "",
            vatRateCode: "MANUAL",
          }),
        ),
      );
    } else if (opts?.preferMultiProjectAllocation) {
      setProjectAllocMode("multi");
      const pid = r.projectId?.trim();
      const vatRateCode = defaultCostAllocationVatRateCode(r);
      setProjectAllocRows(
        pid
          ? [newCostAllocationRow({ projectId: pid, netAmount: String(r.netAmount), grossAmount: String(r.grossAmount), vatRateCode })]
          : [newCostAllocationRow({ projectId: "", netAmount: String(r.netAmount), grossAmount: String(r.grossAmount), vatRateCode })],
      );
    } else {
      setProjectAllocMode("simple");
      setProjectAllocRows([]);
    }
    setFormError(null);
    setPdfDraftNote(null);
    setVehicleApplies(!!r.vehicleId);
  }

  function resetCreateForm() {
    plannedPaymentManualRef.current = false;
    sourcePlannedEventIdRef.current = sourcePlannedEventId ?? null;
    postCreateReturnRef.current = postCreateReturn ?? { returnTo: null, sourceProjectId: null };
    setAmountEntryMode("net");
    setCostAmountVatRateCode("23");
    setVatOnlyPayment(false);
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
    setVehicleApplies(false);
    setEditing({ ...emptyDraft(), ...initialDraft });
    setFormError(null);
    setPdfDraftNote(null);
    setPayOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFormError(null);
    setPdfDraftNote(null);
    setPayOpen(false);
    setPayDraft({ amountGross: "", paymentDate: "", notes: "" });
    setPayProjectRows([]);
    setPayProjectManual(false);

    if (mode === "edit" && invoiceId) {
      setLoading(true);
      void (async () => {
        try {
          const res = await fetch(`/api/cost-invoices/${invoiceId}`);
          const row = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setFormError(readApiErrorBody(row));
            return;
          }
          applyRowToForm(row as CostInvoiceRow, { preferMultiProjectAllocation });
        } catch {
          if (!cancelled) setFormError("Błąd sieci przy pobieraniu faktury.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (mode === "ksef-import" && ksefDocumentId) {
      setLoading(true);
      void (async () => {
        try {
          const res = await fetch(`/api/ksef/documents/${ksefDocumentId}`);
          const data = await res.json();
          if (cancelled) return;
          if (!res.ok) {
            setFormError(typeof data?.error === "string" ? data.error : "Nie udało się wczytać dokumentu KSeF.");
            return;
          }
          const doc = data.document ?? data;
          const preview = data.preview;
          const draft = buildCostInvoiceDraftFromKsef(doc, preview);
          setVatOnlyPayment(false);
          setAmountEntryMode("net");
          setCostAmountVatRateCode(costAmountRateCodeFromInvoice(draft as Draft));
          setProjectAllocMode("simple");
          setProjectAllocRows([]);
          setVehicleApplies(false);
          plannedPaymentManualRef.current = false;
          sourcePlannedEventIdRef.current = null;
          postCreateReturnRef.current = { returnTo: null, sourceProjectId: null };
          setEditing({ ...emptyDraft(), ...draft, ...initialDraft });
        } catch {
          if (!cancelled) setFormError("Błąd sieci przy pobieraniu dokumentu KSeF.");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    resetCreateForm();
    return () => {
      cancelled = true;
    };
  }, [open, mode, invoiceId, ksefDocumentId, initialDraft, sourcePlannedEventId, postCreateReturn, preferMultiProjectAllocation]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/expense-categories")
      .then((r) => r.json())
      .then((j: Cat[]) => setCategories(Array.isArray(j) ? j : []))
      .catch(() => setCategories([]));
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j: ProjectOption[]) => setProjects(Array.isArray(j) ? j : []))
      .catch(() => setProjects([]));
    fetch("/api/vehicles?activeOnly=1")
      .then((r) => r.json())
      .then((j: VehicleOption[]) => setVehicles(Array.isArray(j) ? j : []))
      .catch(() => setVehicles([]));
  }, [open]);

  function closeModal() {
    setPayOpen(false);
    onClose();
  }

  function applyCostPdfDraft(res: InvoicePdfDraftResponse) {
    const v = res.values;
    setEditing((prev) => {
      const next = { ...prev };
      if (v.documentNumber?.trim()) next.documentNumber = v.documentNumber.trim();
      if (v.supplier?.trim()) next.supplier = v.supplier.trim();
      if (v.description?.trim()) next.description = v.description.trim();
      if (v.documentDate) next.documentDate = v.documentDate;
      if (v.paymentDueDate) {
        next.paymentDueDate = v.paymentDueDate;
        next.plannedPaymentDate = v.paymentDueDate;
      }
      if (v.netAmount) next.netAmount = v.netAmount;
      if (v.vatAmount) next.vatAmount = v.vatAmount;
      if (v.grossAmount) next.grossAmount = v.grossAmount;
      if (v.vatRate != null && v.netAmount && v.vatAmount) next.vatRate = v.vatRate;
      return next;
    });
    if (res.values.netAmount) setAmountEntryMode("net");
    if (res.values.vatRate != null) {
      setCostAmountVatRateCode(String(res.values.vatRate) as CostAmountVatRateCode);
    }
    const parts: string[] = [];
    if (res.filledLabels.length) parts.push(`Uzupełniono z PDF: ${res.filledLabels.join(", ")}.`);
    for (const w of res.warnings) parts.push(w);
    setPdfDraftNote(parts.join("\n"));
    setFormError(null);
  }

  function applyPaymentDue(dueYmd: string) {
    setEditing((prev) => {
      const next = { ...prev, paymentDueDate: dueYmd };
      if (!plannedPaymentManualRef.current) {
        next.plannedPaymentDate = dueYmd;
      }
      return next;
    });
  }

  function handleAmountModeChange(m: CostAmountEntryMode) {
    if (vatOnlyPayment) return;
    setAmountEntryMode(m);
    setEditing((prev) => {
      if (m === "netVat") {
        return { ...prev, ...costInvoiceAmountsFromNetVat(prev.netAmount, prev.vatAmount) };
      }
      if (m === "gross") {
        const a = costInvoiceAmountsFromGross(prev.grossAmount, costAmountVatRateCode);
        return { ...prev, ...a, vatRate: storedVatRateFromCode(costAmountVatRateCode) };
      }
      const a = costInvoiceAmountsFromNet(prev.netAmount, costAmountVatRateCode);
      return { ...prev, ...a, vatRate: storedVatRateFromCode(costAmountVatRateCode) };
    });
  }

  function handleCostAmountVatRateChange(vatRateCode: CostAmountVatRateCode) {
    if (vatOnlyPayment) return;
    setCostAmountVatRateCode(vatRateCode);
    setEditing((prev) => {
      const storedRate = storedVatRateFromCode(vatRateCode);
      if (amountEntryMode === "netVat") {
        return { ...prev, vatRate: storedRate };
      }
      if (amountEntryMode === "gross") {
        const a = costInvoiceAmountsFromGross(prev.grossAmount, vatRateCode);
        return { ...prev, ...a, vatRate: storedRate };
      }
      const a = costInvoiceAmountsFromNet(prev.netAmount, vatRateCode);
      return { ...prev, ...a, vatRate: storedRate };
    });
  }

  function buildSaveBody(): Record<string, unknown> | null {
    const documentDate = toIsoOrNull(String(editing.documentDate ?? ""));
    const paymentDueDate = toIsoOrNull(String(editing.paymentDueDate ?? ""));
    const plannedPaymentDate = toIsoOrNull(String(editing.plannedPaymentDate ?? ""));
    if (!documentDate || !paymentDueDate || !plannedPaymentDate) {
      setFormError("Uzupełnij poprawnie datę dokumentu, termin i planowaną datę zapłaty.");
      return null;
    }
    const recurringPatch =
      editing.id && editing.isGeneratedFromRecurring
        ? { isRecurringDetached: !!editing.isRecurringDetached }
        : {};
    const projectIdPayload = editing.projectId?.trim() || null;

    if (editCostPlaceKind === "PROJECT" && projectAllocMode === "multi") {
      const ok = projectAllocRows.filter((row) => row.projectId.trim());
      if (ok.length === 0) {
        setFormError("Tryb kilku projektów: dodaj co najmniej jeden wiersz z wybranym projektem.");
        return null;
      }
    }

    const allocPart: Record<string, unknown> = (() => {
      if (editCostPlaceKind !== "PROJECT") {
        return editing.id ? { projectAllocations: [] as never[] } : {};
      }
      if (projectAllocMode === "multi") {
        const ok = projectAllocRows.filter((row) => row.projectId.trim());
        return {
          projectAllocations: ok.map((row) => ({
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

    const projectField =
      editCostPlaceKind !== "PROJECT" || projectAllocMode === "multi"
        ? { projectId: null }
        : { projectId: projectIdPayload };

    const accountingFields = {
      costPlaceKind: editing.costPlaceKind ?? "UNCLASSIFIED",
      accountingNote: editing.accountingNote ?? "",
      vehicleId: vehicleApplies ? editing.vehicleId ?? null : null,
    };

    if (vatOnlyPayment) {
      return {
        documentNumber: editing.documentNumber,
        supplier: editing.supplier,
        description: editing.description,
        vatOnly: true,
        vatRate: 0,
        netAmount: normalizeDecimalInput("0"),
        vatAmount: normalizeDecimalInput(editing.vatAmount),
        grossAmount: normalizeDecimalInput(editing.grossAmount),
        documentDate,
        paymentDueDate,
        plannedPaymentDate,
        status: editing.status,
        paid: editing.status === "ZAPLACONA",
        actualPaymentDate: toIsoOrNull(editing.actualPaymentDate ?? undefined),
        paymentSource: editing.paymentSource,
        notes: editing.notes,
        ...projectField,
        expenseCategoryId: editing.expenseCategoryId || null,
        ...accountingFields,
        ...recurringPatch,
        ...allocPart,
        amountToPayGross: editing.amountToPayGross != null ? normalizeDecimalInput(editing.amountToPayGross) : undefined,
      };
    }

    return {
      documentNumber: editing.documentNumber,
      supplier: editing.supplier,
      description: editing.description,
      vatOnly: false,
      vatRate: storedVatRateFromCode(costAmountVatRateCode),
      netAmount: normalizeDecimalInput(editing.netAmount),
      vatAmount: normalizeDecimalInput(editing.vatAmount),
      grossAmount: normalizeDecimalInput(editing.grossAmount),
      documentDate,
      paymentDueDate,
      plannedPaymentDate,
      status: editing.status,
      paid: editing.status === "ZAPLACONA",
      actualPaymentDate: toIsoOrNull(editing.actualPaymentDate ?? undefined),
      paymentSource: editing.paymentSource,
      notes: editing.notes,
      ...projectField,
      expenseCategoryId: editing.expenseCategoryId || null,
      ...accountingFields,
      ...recurringPatch,
      ...allocPart,
      amountToPayGross: editing.amountToPayGross != null ? normalizeDecimalInput(editing.amountToPayGross) : undefined,
    };
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const body = buildSaveBody();
    if (!body) {
      setSaving(false);
      return;
    }

    try {
      if (mode === "ksef-import" && ksefDocumentId) {
        const res = await fetch(`/api/ksef/documents/${ksefDocumentId}/import-cost`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body as KsefImportCostBody),
        });
        const j = await res.json();
        if (!res.ok) {
          setFormError(readApiErrorBody(j));
          return;
        }
        const createdId = j?.costInvoice?.id;
        onSaved(createdId ? { invoiceId: String(createdId) } : undefined);
        return;
      }

      const postExtra =
        mode === "create" && sourcePlannedEventIdRef.current
          ? { sourcePlannedEventId: sourcePlannedEventIdRef.current }
          : {};
      const url = editing.id ? `/api/cost-invoices/${editing.id}` : "/api/cost-invoices";
      const method = editing.id ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...postExtra }),
      });
      const j = await res.json();
      if (!res.ok) {
        setFormError(readApiErrorBody(j));
        return;
      }
      const savedId = j?.id ?? editing.id;
      const snap = postCreateReturnRef.current;
      if (method === "POST") {
        const redirectPid =
          projectAllocMode === "multi"
            ? projectAllocRows.find((x) => x.projectId.trim())?.projectId
            : editing.projectId?.trim() || null;
        const dest =
          snap.returnTo ??
          (redirectPid ? `/projects/${redirectPid}` : null) ??
          (snap.sourceProjectId ? `/projects/${snap.sourceProjectId}` : null);
        if (dest) {
          router.push(dest);
          onSaved(savedId ? { invoiceId: String(savedId) } : undefined);
          return;
        }
      }
      onSaved(savedId ? { invoiceId: String(savedId) } : undefined);
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function refreshPaymentsForInvoice(id: string) {
    const r = await fetch(`/api/cost-invoices/${id}`);
    const j = await r.json();
    if (!r.ok) return;
    applyRowToForm({ ...j, id } as CostInvoiceRow);
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!editing.id) return;
    const pd = toIsoOrNull(payDraft.paymentDate);
    if (!pd) {
      setFormError("Ustaw datę płatności.");
      return;
    }
    const gNorm = normalizeDecimalInput(payDraft.amountGross);
    if (costInvoiceMultiProject(editing)) {
      if (payProjectRows.length === 0) {
        setFormError("Ustaw podział brutto na projekty (dokument ma wiele alokacji).");
        return;
      }
      const sum = payProjectRows.reduce((a, r) => a + (Number(normalizeDecimalInput(r.grossAmount)) || 0), 0);
      const target = Number(gNorm);
      if (!Number.isFinite(sum) || !Number.isFinite(target) || Math.abs(sum - target) > 0.02) {
        setFormError("Suma brutto po projektach musi równać się kwocie płatności.");
        return;
      }
    }
    setPaySaving(true);
    setFormError(null);
    try {
      const body: Record<string, unknown> = {
        amountGross: gNorm,
        paymentDate: pd,
        notes: payDraft.notes,
      };
      if (costInvoiceMultiProject(editing) && payProjectRows.length > 0) {
        body.projectAllocations = payProjectRows.map((r) => ({
          projectId: r.projectId,
          grossAmount: normalizeDecimalInput(r.grossAmount),
          description: "",
        }));
      }
      const res = await fetch(`/api/cost-invoices/${editing.id}/payments`, {
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
      await refreshPaymentsForInvoice(editing.id);
      onSaved({ invoiceId: editing.id });
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setPaySaving(false);
    }
  }

  async function deletePayment(pid: string) {
    if (!editing.id) return;
    if (!confirm("Usunąć tę płatność?")) return;
    const res = await fetch(`/api/cost-invoices/${editing.id}/payments/${pid}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    await refreshPaymentsForInvoice(editing.id);
    onSaved({ invoiceId: editing.id });
  }

  async function removeFromEdit() {
    if (!editing.id) return;
    if (!confirm("Usunąć ten dokument kosztowy? Operacja jest nieodwracalna.")) return;
    const res = await fetch(`/api/cost-invoices/${editing.id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return;
    }
    onSaved();
  }

  const modalTitle =
    mode === "ksef-import"
      ? "Import faktury kosztowej z KSeF"
      : editing.id
        ? "Edycja faktury kosztowej"
        : "Nowa faktura kosztowa";

  return (
    <CostInvoiceFormModal
      open={open}
      editing={editing}
      setEditing={setEditing}
      formError={formError}
      setFormError={setFormError}
      pdfDraftNote={pdfDraftNote}
      saving={saving || loading}
      categories={categories}
      projects={projects}
      vehicles={vehicles}
      categoriesForForm={categoriesForForm}
      editCostPlaceKind={editCostPlaceKind}
      editAccount5Preview={editAccount5Preview}
      editAccount5CopyAllocs={editAccount5CopyAllocs}
      closeModal={closeModal}
      save={save}
      applyCostPdfDraft={applyCostPdfDraft}
      amountEntryMode={amountEntryMode}
      setAmountEntryMode={setAmountEntryMode}
      costAmountVatRateCode={costAmountVatRateCode}
      setCostAmountVatRateCode={setCostAmountVatRateCode}
      vatOnlyPayment={vatOnlyPayment}
      setVatOnlyPayment={setVatOnlyPayment}
      handleAmountModeChange={handleAmountModeChange}
      handleCostAmountVatRateChange={handleCostAmountVatRateChange}
      projectAllocMode={projectAllocMode}
      setProjectAllocMode={setProjectAllocMode}
      projectAllocRows={projectAllocRows}
      setProjectAllocRows={setProjectAllocRows}
      projectAllocationTotals={projectAllocationTotals}
      vehicleApplies={vehicleApplies}
      setVehicleApplies={setVehicleApplies}
      plannedPaymentManualRef={plannedPaymentManualRef}
      applyPaymentDue={applyPaymentDue}
      payOpen={payOpen}
      setPayOpen={setPayOpen}
      submitPayment={submitPayment}
      payDraft={payDraft}
      setPayDraft={setPayDraft}
      paySaving={paySaving}
      payProjectManual={payProjectManual}
      setPayProjectManual={setPayProjectManual}
      payProjectRows={payProjectRows}
      setPayProjectRows={setPayProjectRows}
      deletePayment={deletePayment}
      removeFromEdit={removeFromEdit}
      overlayZIndexClass={overlayZIndexClass}
      modalTitle={modalTitle}
    />
  );
}