"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProjectSearchPicker } from "@/components/ProjectSearchPicker";
import { ExpenseCategorySearchPicker } from "@/components/ExpenseCategorySearchPicker";
import { VehicleSearchPicker } from "@/components/VehicleSearchPicker";
import {
  account5FromPlaceKind,
  account5FromProjectCode,
  COST_PLACE_KINDS,
  costPlaceKindLabel,
  formatAccount5Display,
  type CostPlaceKind,
} from "@/lib/accounting/account-codes";
import { formatVehicleLabel } from "@/lib/accounting/vehicle-label";
import { ContractorNameLink } from "@/components/ContractorNameLink";
import { Alert, Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";
import { CostInvoicesListToolbar } from "@/components/CostInvoicesListToolbar";
import { formatDate, formatMoney, toIsoOrNull } from "@/lib/format";
import { isoToDateInputValue } from "@/lib/date-input";
import { amountsFromNetRate, inferVatRateFromAmounts, type VatRatePct } from "@/lib/vat-rate";
import { ContractorAutocomplete } from "@/components/ContractorAutocomplete";
import { readApiErrorBody, readApiResponse } from "@/lib/api-client";
import { usePersistentListState } from "@/hooks/usePersistentListState";
import { isCalendarOverdue } from "@/lib/cashflow/overdue";
import type { CostInvoice, CostInvoicePayment } from "@prisma/client";
import { costRemainingGross, isCostFullyPaid, sumCostPaymentsGross } from "@/lib/cashflow/settlement";
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
import {
  addSavedCostListView,
  COST_LIST_PERSISTENCE_CONFIG,
  loadSavedCostListViews,
  removeSavedCostListView,
  type SavedCostListView,
} from "@/lib/cost-invoices-list-storage";
import { InvoicePdfDraftSection } from "@/components/InvoicePdfDraftSection";
import type { InvoicePdfDraftResponse } from "@/lib/invoice-pdf/types";
import { postCreateReturnFromSearchParams, type PostCreateReturnCapture } from "@/lib/safe-internal-return-path";
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

type Row = {
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

type Draft = Omit<Row, "id"> & { id?: string };

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

function emptyDraft(): Draft {
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

function recurringSourceBadge(r: Row) {
  if (!r.isGeneratedFromRecurring) return <Badge variant="muted">Ręczne</Badge>;
  if (r.isRecurringDetached) return <Badge variant="warning">Cykliczne · odłączone</Badge>;
  return <Badge variant="default">Cykliczne</Badge>;
}

function costEntrySourceBadge(r: Row) {
  const bankLinked = r.payments?.some((p) => p.bankTransactionId);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {bankLinked ? (
        <span title="Powiązanie z płatnością z importu bankowego">
          <Badge variant="default">Bank</Badge>
        </span>
      ) : null}
      {recurringSourceBadge(r)}
    </span>
  );
}

function costRowOverdue(r: Row): boolean {
  const inv = r as unknown as CostInvoice;
  const pays = (r.payments ?? []) as unknown as PayPick[];
  if (isCostFullyPaid(inv, pays)) return false;
  const now = new Date();
  if (!r.plannedPaymentDate || !r.paymentDueDate) return false;
  return (
    isCalendarOverdue(new Date(r.plannedPaymentDate), now) ||
    isCalendarOverdue(new Date(r.paymentDueDate), now)
  );
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

function CostListSubline({
  r,
  settled,
  remaining,
}: {
  r: Row;
  settled: number;
  remaining: number;
}) {
  const src = paymentSourceLabel(r.paymentSource);
  const srcLong =
    r.paymentSource === "VAT_THEN_MAIN"
      ? "Najpierw konto VAT, potem MAIN (wg ustawień dokumentu)"
      : r.paymentSource === "MAIN"
        ? "Płatność z konta MAIN"
        : "Płatność z konta VAT";
  const cat = r.expenseCategory?.name ?? "—";
  const note = [r.description?.trim(), r.notes?.trim()].filter(Boolean).join(" — ");
  return (
    <div className="mt-1.5 space-y-1 text-[10px] leading-snug text-zinc-500 dark:text-zinc-400">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <span className="shrink-0 text-zinc-400">Źródło</span>
        <span className="min-w-0">{costEntrySourceBadge(r)}</span>
        <span className="text-zinc-400">·</span>
        <span className="line-clamp-1 min-w-0" title={`Kategoria: ${cat}`}>
          Kat.: {cat}
        </span>
      </p>
      <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <span title={srcLong}>VAT / płatność: {src}</span>
        <span className="text-zinc-400">·</span>
        <span title="Suma zarejestrowanych zapłat brutto" className="tabular-nums text-zinc-600 dark:text-zinc-300">
          Zapłac.: {formatMoney(settled)}
        </span>
        <span className="text-zinc-400">·</span>
        <span title="Pozostało do rozliczenia brutto" className="tabular-nums text-zinc-600 dark:text-zinc-300">
          Zostało: {formatMoney(remaining)}
        </span>
        {note ? (
          <>
            <span className="text-zinc-400">·</span>
            <span className="line-clamp-2 min-w-0 max-w-full break-words text-zinc-500" title={note}>
              {note}
            </span>
          </>
        ) : null}
      </p>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "plannedPaymentDate", label: "Plan. zapłata" },
  { value: "paymentDueDate", label: "Termin płatności" },
  { value: "documentDate", label: "Data dokumentu" },
  { value: "documentNumber", label: "Numer dokumentu" },
  { value: "supplier", label: "Dostawca" },
  { value: "netAmount", label: "Netto" },
  { value: "grossAmount", label: "Brutto" },
  { value: "status", label: "Status" },
  { value: "createdAt", label: "Data utworzenia" },
];

function costListFiltersEmptyForQuickAll(m: URLSearchParams): boolean {
  return (
    !m.get("q")?.trim() &&
    !m.get("status")?.trim() &&
    !m.get("categories")?.trim() &&
    !m.get("categoryId")?.trim() &&
    m.get("uncategorized") !== "1" &&
    m.get("overdue") !== "1" &&
    !m.get("recurringSource")?.trim() &&
    !m.get("projectId")?.trim() &&
    !m.get("vehicleId")?.trim() &&
    !m.get("costPlaceKind")?.trim() &&
    !m.get("paymentSource")?.trim() &&
    !m.get("account4")?.trim() &&
    !m.get("dateFrom")?.trim() &&
    !m.get("dateTo")?.trim()
  );
}

function costListPlaceCell(r: Row) {
  const kind = r.costPlaceKind;
  if (kind === "GENERAL_502") {
    return <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">502-01</span>;
  }
  if (kind === "MANAGEMENT_550") {
    return <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">550-01</span>;
  }
  const allocs = r.projectAllocations ?? [];
  if (allocs.length > 1) {
    const lines = allocs.map((a) => {
      const code = a.account5Code?.trim() || account5FromProjectCode(a.project?.code) || "—";
      const name = a.project?.name?.trim() || "—";
      return `${code} · ${name}`;
    });
    return (
      <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200" title={lines.join("\n")}>
        {allocs.length} projektów
      </span>
    );
  }
  if (allocs.length === 1) {
    const a = allocs[0];
    const code = a.account5Code?.trim() || account5FromProjectCode(a.project?.code);
    const name = a.project?.name?.trim();
    const label = code ?? name ?? "—";
    const title = code && name ? `${code} · ${name}` : label;
    return (
      <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200" title={title}>
        {label}
      </span>
    );
  }
  const code = r.account5Code?.trim() || account5FromProjectCode(r.project?.code);
  if (code) {
    const name = r.project?.name?.trim();
    return (
      <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200" title={name ? `${code} · ${name}` : code}>
        {code}
      </span>
    );
  }
  return <span className="text-zinc-500 dark:text-zinc-400">—</span>;
}

function costListClassificationCell(r: Row) {
  const account5 = r.account5Code?.trim() || null;
  const account4 = r.expenseCategory?.accountingCode?.trim() || null;
  const note = r.accountingNote?.trim() || "";
  const vehicleReg = r.vehicle ? formatVehicleLabel(r.vehicle) : null;
  if (!account5 && !account4 && !note && !vehicleReg) {
    return <span className="text-zinc-500 dark:text-zinc-400">—</span>;
  }
  return (
    <div className="space-y-0.5 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
      {account5 ? (
        <p className="font-mono font-medium text-zinc-900 dark:text-zinc-100" title="Konto 5">
          5: {account5}
        </p>
      ) : null}
      {account4 ? (
        <p className="font-mono text-zinc-600 dark:text-zinc-400" title="Konto 4">
          4: {account4}
        </p>
      ) : null}
      {note ? (
        <p className="line-clamp-2 break-words text-zinc-500 dark:text-zinc-400" title={note}>
          {note}
        </p>
      ) : null}
      {vehicleReg ? (
        <p className="truncate text-emerald-800 dark:text-emerald-300" title={`Pojazd: ${vehicleReg}`}>
          {vehicleReg}
        </p>
      ) : null}
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

function costInvoicePrefillFromPlannedEvent(ev: { amount?: unknown; amountVat?: unknown }): {
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

export function CostInvoicesClient({
  initialQueryString = "",
  embeddedCostInvoiceId = null,
  onEmbeddedClose,
  onEmbeddedSaved,
  overlayZIndexClass = "z-50",
}: {
  initialQueryString?: string;
  embeddedCostInvoiceId?: string | null;
  onEmbeddedClose?: () => void;
  onEmbeddedSaved?: () => void;
  overlayZIndexClass?: string;
}) {
  const embedded = Boolean(embeddedCostInvoiceId);
  const router = useRouter();
  const pathname = usePathname();
  const { queryString, setParam, setParams, merged, clearPersisted, replaceQuery } = usePersistentListState(
    initialQueryString,
    COST_LIST_PERSISTENCE_CONFIG,
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Draft>(emptyDraft());
  const [formError, setFormError] = useState<string | null>(null);
  const [pdfDraftNote, setPdfDraftNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payDraft, setPayDraft] = useState({ amountGross: "", paymentDate: "", notes: "" });
  const [payProjectRows, setPayProjectRows] = useState<{ projectId: string; grossAmount: string }[]>([]);
  const [payProjectManual, setPayProjectManual] = useState(false);
  const [paySaving, setPaySaving] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [vehicleApplies, setVehicleApplies] = useState(false);
  const plannedPaymentManualRef = useRef(false);
  const sourcePlannedEventIdRef = useRef<string | null>(null);
  const postCreateReturnRef = useRef<PostCreateReturnCapture>({ returnTo: null, sourceProjectId: null });
  const [amountEntryMode, setAmountEntryMode] = useState<CostAmountEntryMode>("net");
  const [costAmountVatRateCode, setCostAmountVatRateCode] = useState<CostAmountVatRateCode>("23");
  /** Netto 0, brutto = VAT — np. płatność samego VAT z konta VAT. */
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

  const [filterDraft, setFilterDraft] = useState({
    q: "",
    status: "",
    categoryIds: [] as string[],
    uncategorizedOnly: false,
    recurringSource: "",
    projectId: "",
    vehicleId: "",
    costPlaceKind: "",
    paymentSource: "",
    account4: "",
    dateFrom: "",
    dateTo: "",
    dateField: "plannedPaymentDate",
    overdueOnly: false,
  });

  const [savedViews, setSavedViews] = useState<SavedCostListView[]>([]);

  useEffect(() => {
    setSavedViews(loadSavedCostListViews());
  }, []);

  useEffect(() => {
    const m = new URLSearchParams(queryString);
    const catsRaw = m.get("categories")?.trim();
    const legacy = m.get("categoryId")?.trim();
    const categoryIds = catsRaw
      ? catsRaw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      : legacy
        ? [legacy]
        : [];
    setFilterDraft({
      q: m.get("q") ?? "",
      status: m.get("status") ?? "",
      categoryIds,
      uncategorizedOnly: m.get("uncategorized") === "1",
      recurringSource: m.get("recurringSource") ?? "",
      projectId: m.get("projectId") ?? "",
      vehicleId: m.get("vehicleId") ?? "",
      costPlaceKind: m.get("costPlaceKind") ?? "",
      paymentSource: m.get("paymentSource") ?? "",
      account4: m.get("account4") ?? "",
      dateFrom: m.get("dateFrom") ?? "",
      dateTo: m.get("dateTo") ?? "",
      dateField: m.get("dateField") || "plannedPaymentDate",
      overdueOnly: m.get("overdue") === "1",
    });
  }, [queryString]);

  useEffect(() => {
    fetch("/api/expense-categories")
      .then((r) => r.json())
      .then((j: Cat[]) => setCategories(Array.isArray(j) ? j : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((j: ProjectOption[]) => setProjects(Array.isArray(j) ? j : []))
      .catch(() => setProjects([]));
  }, []);

  useEffect(() => {
    fetch("/api/vehicles?activeOnly=1")
      .then((r) => r.json())
      .then((j: VehicleOption[]) => setVehicles(Array.isArray(j) ? j : []))
      .catch(() => setVehicles([]));
  }, []);

  const load = useCallback(async () => {
    setListLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/cost-invoices?${queryString}`);
      const parsed = await readApiResponse(r);
      if (!parsed.ok) throw new Error(parsed.errorText);
      setRows(Array.isArray(parsed.data) ? (parsed.data as Row[]) : []);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : "Nie udało się wczytać listy");
    } finally {
      setListLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    if (embedded) return;
    load();
  }, [embedded, load]);

  function applyFilters() {
    setParams({
      q: filterDraft.q.trim() || null,
      status: filterDraft.status || null,
      categories:
        filterDraft.uncategorizedOnly ? null
        : filterDraft.categoryIds.length > 0 ?
          filterDraft.categoryIds.join(",")
        : null,
      categoryId: null,
      uncategorized: filterDraft.uncategorizedOnly ? "1" : null,
      recurringSource: filterDraft.recurringSource || null,
      projectId: filterDraft.projectId || null,
      vehicleId: filterDraft.vehicleId || null,
      costPlaceKind: filterDraft.costPlaceKind || null,
      paymentSource: filterDraft.paymentSource || null,
      account4: filterDraft.account4.trim() || null,
      dateFrom: filterDraft.dateFrom || null,
      dateTo: filterDraft.dateTo || null,
      dateField: filterDraft.dateField,
      overdue: filterDraft.overdueOnly ? "1" : null,
    });
  }

  function clearFilters() {
    clearPersisted();
    setParams({
      q: null,
      status: null,
      categories: null,
      categoryId: null,
      uncategorized: null,
      recurringSource: null,
      projectId: null,
      vehicleId: null,
      costPlaceKind: null,
      paymentSource: null,
      account4: null,
      dateFrom: null,
      dateTo: null,
      dateField: null,
      overdue: null,
      sort: null,
      order: null,
    });
  }

  function applyQuickPreset(id: "all" | "uncategorized" | "overdue") {
    if (id === "all") {
      clearFilters();
      return;
    }
    if (id === "uncategorized") {
      setParams({
        uncategorized: "1",
        categories: null,
        categoryId: null,
      });
      return;
    }
    setParams({ overdue: "1" });
  }

  function saveCurrentView() {
    const name = window.prompt("Nazwa widoku (np. miesiąc + kategorie):");
    if (name == null || !name.trim()) return;
    addSavedCostListView(name.trim(), queryString);
    setSavedViews(loadSavedCostListViews());
  }

  function loadSavedView(v: SavedCostListView) {
    replaceQuery(v.query);
  }

  function deleteSavedView(id: string) {
    if (!confirm("Usunąć zapisany widok z tej przeglądarki?")) return;
    removeSavedCostListView(id);
    setSavedViews(loadSavedCostListViews());
  }

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
  }, [
    editing.account5Code,
    editing.project,
    editing.projectId,
    editCostPlaceKind,
    projectAllocMode,
    projectAllocRows,
    projects,
  ]);

  const sort = merged.get("sort") ?? "plannedPaymentDate";
  const order = (merged.get("order") === "desc" ? "desc" : "asc") as "asc" | "desc";

  function clickHeaderSort(key: string) {
    if (!SORT_OPTIONS.some((o) => o.value === key)) return;
    if (sort === key) setParam("order", order === "asc" ? "desc" : "asc");
    else setParams({ sort: key, order: "asc" });
  }

  function costSortTh(label: string, sortKey: string, align: "left" | "right" = "left") {
    const active = sort === sortKey;
    const ac = align === "right" ? "justify-end text-right" : "justify-start text-left";
    return (
      <button
        type="button"
        className={`${ac} inline-flex w-full min-w-0 items-center gap-0.5 rounded-md py-0.5 text-xs font-semibold uppercase tracking-wide hover:bg-zinc-200/80 hover:text-zinc-950 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-50 ${active ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400"}`}
        onClick={() => clickHeaderSort(sortKey)}
      >
        <span className="min-w-0">{label}</span>
        {active ? (order === "asc" ? " ↑" : " ↓") : null}
      </button>
    );
  }

  function closeModal() {
    setOpen(false);
    setFormError(null);
    setPdfDraftNote(null);
    setPayOpen(false);
    sourcePlannedEventIdRef.current = null;
    postCreateReturnRef.current = { returnTo: null, sourceProjectId: null };
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
    setVehicleApplies(false);
    if (embedded) {
      onEmbeddedClose?.();
    }
  }

  function openNew() {
    plannedPaymentManualRef.current = false;
    sourcePlannedEventIdRef.current = null;
    postCreateReturnRef.current = { returnTo: null, sourceProjectId: null };
    setAmountEntryMode("net");
    setCostAmountVatRateCode("23");
    setVatOnlyPayment(false);
    setProjectAllocMode("simple");
    setProjectAllocRows([]);
    setVehicleApplies(false);
    setEditing(emptyDraft());
    setFormError(null);
    setPdfDraftNote(null);
    setOpen(true);
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

  function handleRowClickOpenEdit(r: Row) {
    return (e: React.MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("button, a, input, textarea, select, label")) return;
      openEdit(r);
    };
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

  function openEdit(r: Row, opts?: { preferMultiProjectAllocation?: boolean }) {
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
          ? [
              newCostAllocationRow({
                projectId: pid,
                netAmount: String(r.netAmount),
                grossAmount: String(r.grossAmount),
                vatRateCode,
              }),
            ]
          : [
              newCostAllocationRow({
                projectId: "",
                netAmount: String(r.netAmount),
                grossAmount: String(r.grossAmount),
                vatRateCode,
              }),
            ],
      );
    } else {
      setProjectAllocMode("simple");
      setProjectAllocRows([]);
    }
    setFormError(null);
    setPdfDraftNote(null);
    setVehicleApplies(!!r.vehicleId);
    setOpen(true);
  }

  const openEditRef = useRef(openEdit);
  openEditRef.current = openEdit;

  useEffect(() => {
    if (!embeddedCostInvoiceId) return;
    let cancelled = false;
    void (async () => {
      const r = await fetch(`/api/cost-invoices/${embeddedCostInvoiceId}`);
      const j = await r.json();
      if (cancelled) return;
      if (r.ok) {
        openEditRef.current(j as Row);
      } else {
        onEmbeddedClose?.();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embeddedCostInvoiceId, onEmbeddedClose]);

  const stripCostDeepLinkParams = {
    editCost: null as string | null,
    new: null as string | null,
    projectId: null as string | null,
    clientName: null as string | null,
    projectName: null as string | null,
    projectCode: null as string | null,
    convertPlannedEventId: null as string | null,
    multiProject: null as string | null,
    returnTo: null as string | null,
  };

  const listQs = merged.toString();
  useEffect(() => {
    const m = new URLSearchParams(listQs);
    const editCost = m.get("editCost");
    const openMultiAlloc = m.get("multiProject") === "1";
    const wantNew = m.get("new") === "1";
    const convertPlanned = m.get("convertPlannedEventId")?.trim() || null;
    const prefillPid = m.get("projectId")?.trim() || null;
    const prefillClient = m.get("clientName")?.trim() || "";
    const prefillProjectName = m.get("projectName")?.trim() || "";
    const prefillProjectCode = m.get("projectCode")?.trim() || "";
    if (!editCost && !wantNew && !convertPlanned) return;
    let cancelled = false;
    void (async () => {
      if (editCost) {
        const r = await fetch(`/api/cost-invoices/${editCost}`);
        const j = await r.json();
        if (cancelled) return;
        if (r.ok) {
          openEditRef.current(
            j as Row,
            openMultiAlloc ? { preferMultiProjectAllocation: true } : undefined,
          );
        }
        queueMicrotask(() => setParams(stripCostDeepLinkParams));
        return;
      }
      if (convertPlanned) {
        const r = await fetch(`/api/planned-events/${convertPlanned}`);
        const ev = await r.json();
        if (cancelled) return;
        if (!r.ok || ev.status !== "PLANNED" || ev.type !== "EXPENSE") {
          alert("Nie można utworzyć faktury z tego zdarzenia (wymagane: status „Zaplanowane”, typ wydatek).");
          queueMicrotask(() => setParams(stripCostDeepLinkParams));
          return;
        }
        postCreateReturnRef.current = postCreateReturnFromSearchParams(m);
        let supplier = prefillClient;
        if (!supplier && ev.projectId) {
          const pr = await fetch(`/api/projects/${ev.projectId}`);
          const pj = await pr.json();
          if (pr.ok && pj?.clientName) supplier = String(pj.clientName).trim();
        }
        plannedPaymentManualRef.current = false;
        setVatOnlyPayment(false);
        const pd = isoToDateInputValue(ev.plannedDate);
        const plannedAmounts = costInvoicePrefillFromPlannedEvent(ev);
        setAmountEntryMode(plannedAmounts.amountEntryMode);
        setCostAmountVatRateCode(plannedAmounts.costAmountVatRateCode);
        const d: Draft = {
          ...emptyDraft(),
          documentNumber: `ZPL-${ev.id.slice(0, 10)}`,
          supplier,
          description: ev.title ? `Z planu: ${ev.title}` : "",
          netAmount: plannedAmounts.netAmount,
          vatAmount: plannedAmounts.vatAmount,
          grossAmount: plannedAmounts.grossAmount,
          vatRate: plannedAmounts.vatRate,
          documentDate: pd,
          paymentDueDate: pd,
          plannedPaymentDate: pd,
          projectId: ev.projectId || prefillPid || null,
          expenseCategoryId: ev.expenseCategoryId || null,
        };
        {
          let desc = ev.title ? `Z planu: ${ev.title}` : "";
          if (prefillProjectName || prefillProjectCode) {
            const extra = [prefillProjectName && `Projekt: ${prefillProjectName}`, prefillProjectCode && `Numer zlecenia: ${prefillProjectCode}`]
              .filter(Boolean)
              .join(" · ");
            if (extra) desc = desc ? `${desc} · ${extra}` : extra;
          }
          d.description = desc;
        }
        sourcePlannedEventIdRef.current = ev.id;
        setEditing(d);
        setFormError(null);
        setOpen(true);
        queueMicrotask(() => setParams(stripCostDeepLinkParams));
        return;
      }
      if (wantNew) {
        if (cancelled) return;
        postCreateReturnRef.current = postCreateReturnFromSearchParams(m);
        plannedPaymentManualRef.current = false;
        setAmountEntryMode("net");
        setCostAmountVatRateCode("23");
        setVatOnlyPayment(false);
        const d = emptyDraft();
        if (prefillPid) d.projectId = prefillPid;
        if (prefillClient) d.supplier = prefillClient;
        if (prefillProjectName || prefillProjectCode) {
          const parts = [prefillProjectName && `Projekt: ${prefillProjectName}`, prefillProjectCode && `Numer zlecenia: ${prefillProjectCode}`].filter(
            Boolean,
          ) as string[];
          if (parts.length) d.description = parts.join(" · ");
        }
        setEditing(d);
        setFormError(null);
        setOpen(true);
        queueMicrotask(() => setParams(stripCostDeepLinkParams));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listQs, setParams]);

  async function refreshPaymentsForInvoice(id: string) {
    const r = await fetch(`/api/cost-invoices/${id}`);
    const j = await r.json();
    if (!r.ok) return;
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...j } : row)));
    setEditing((prev) => {
      if (prev.id !== id) return prev;
      setVatOnlyPayment(isStoredVatOnlyCost(j.netAmount, j.vatAmount));
      setVehicleApplies(!!j.vehicleId);
      plannedPaymentManualRef.current =
        isoToDateInputValue(j.plannedPaymentDate) !== isoToDateInputValue(j.paymentDueDate);
      return {
        ...prev,
        ...j,
        isGeneratedFromRecurring: !!j.isGeneratedFromRecurring,
        isRecurringDetached: !!j.isRecurringDetached,
        expenseCategoryId: j.expenseCategoryId ?? null,
        costPlaceKind: j.costPlaceKind ?? prev.costPlaceKind ?? "UNCLASSIFIED",
        account5Code: j.account5Code ?? null,
        accountingNote: j.accountingNote ?? "",
        vehicleId: j.vehicleId ?? null,
        vehicle: j.vehicle ?? null,
        vatRate: j.vatRate ?? prev.vatRate,
        documentDate: isoToDateInputValue(j.documentDate),
        paymentDueDate: isoToDateInputValue(j.paymentDueDate),
        plannedPaymentDate: isoToDateInputValue(j.plannedPaymentDate),
        actualPaymentDate: j.actualPaymentDate ? isoToDateInputValue(j.actualPaymentDate) : null,
        netAmount: String(j.netAmount),
        vatAmount: String(j.vatAmount),
        grossAmount: String(j.grossAmount),
        amountToPayGross: j.amountToPayGross != null ? String(j.amountToPayGross) : null,
      };
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

  async function submitPayment(e: React.FormEvent) {
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
      if (embedded) {
        onEmbeddedSaved?.();
      } else {
        load();
      }
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
    if (embedded) {
      onEmbeddedSaved?.();
    } else {
      load();
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportMsg(null);
    const fd = new FormData();
    fd.set("file", f);
    try {
      const res = await fetch("/api/cost-invoices/import", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) {
        setImportMsg(readApiErrorBody(j));
        return;
      }
      setImportMsg(`Import: OK ${j.ok}, błędnych wierszy: ${j.errors?.length ?? 0}`);
      load();
    } catch {
      setImportMsg("Błąd sieci przy imporcie");
    }
    e.target.value = "";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const documentDate = toIsoOrNull(String(editing.documentDate ?? ""));
    const paymentDueDate = toIsoOrNull(String(editing.paymentDueDate ?? ""));
    const plannedPaymentDate = toIsoOrNull(String(editing.plannedPaymentDate ?? ""));
    if (!documentDate || !paymentDueDate || !plannedPaymentDate) {
      setFormError("Uzupełnij poprawnie datę dokumentu, termin i planowaną datę zapłaty.");
      setSaving(false);
      return;
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
        setSaving(false);
        return;
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

    const url = editing.id ? `/api/cost-invoices/${editing.id}` : "/api/cost-invoices";
    const method = editing.id ? "PATCH" : "POST";
    const postExtra =
      method === "POST" && sourcePlannedEventIdRef.current
        ? { sourcePlannedEventId: sourcePlannedEventIdRef.current }
        : {};

    const accountingFields = {
      costPlaceKind: editing.costPlaceKind ?? "UNCLASSIFIED",
      accountingNote: editing.accountingNote ?? "",
      vehicleId: vehicleApplies ? editing.vehicleId ?? null : null,
    };

    const body = vatOnlyPayment
      ? {
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
          ...postExtra,
          ...allocPart,
        }
      : {
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
          ...postExtra,
          ...allocPart,
        };
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
      if (embedded) {
        onEmbeddedSaved?.();
        closeModal();
        return;
      }
      const snap = postCreateReturnRef.current;
      closeModal();
      if (method === "POST") {
        const redirectPid =
          projectAllocMode === "multi"
            ? projectAllocRows.find((x) => x.projectId.trim())?.projectId
            : projectIdPayload;
        const dest =
          snap.returnTo ??
          (redirectPid ? `/projects/${redirectPid}` : null) ??
          (snap.sourceProjectId ? `/projects/${snap.sourceProjectId}` : null);
        if (dest) {
          router.push(dest);
          return;
        }
      }
      load();
    } catch {
      setFormError("Błąd sieci");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCostInvoiceById(id: string): Promise<boolean> {
    const res = await fetch(`/api/cost-invoices/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json();
      alert(readApiErrorBody(j));
      return false;
    }
    return true;
  }

  async function remove(id: string) {
    if (!confirm("Usunąć ten dokument kosztowy?")) return;
    if (await deleteCostInvoiceById(id)) load();
  }

  async function removeFromEdit() {
    if (!editing.id) return;
    if (!confirm("Usunąć ten dokument kosztowy? Operacja jest nieodwracalna.")) return;
    if (await deleteCostInvoiceById(editing.id)) {
      if (embedded) {
        onEmbeddedSaved?.();
        closeModal();
      } else {
        closeModal();
        load();
      }
    }
  }

  const overdueFilterActive = merged.get("overdue") === "1";
  const quickAllActive = costListFiltersEmptyForQuickAll(merged);

  return (
    <div className={embedded ? "" : "space-y-6"}>
      {!embedded ? (
        <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Faktury kosztowe</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Źródło płatności określa, które konto jest obciążane brutto.
            {overdueFilterActive ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <Badge variant="warning">Po terminie</Badge>
                <Link href="/cost-invoices" className="text-zinc-600 underline dark:text-zinc-400">
                  Wyczyść filtr
                </Link>
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={load} disabled={listLoading}>
            Odśwież
          </Button>
          <Button type="button" onClick={openNew} disabled={listLoading}>
            Dodaj
          </Button>
        </div>
      </div>

      <CostInvoicesListToolbar
        filterDraft={filterDraft}
        setFilterDraft={setFilterDraft}
        merged={merged}
        queryString={queryString}
        listLoading={listLoading}
        projects={projects}
        categories={categories}
        vehicles={vehicles}
        sort={sort}
        order={order}
        onSortChange={(v) => setParam("sort", v)}
        onOrderChange={(v) => setParam("order", v)}
        onApply={applyFilters}
        onClear={clearFilters}
        onClearChip={(updates) => setParams(updates)}
        onQuickPreset={applyQuickPreset}
        quickAllActive={quickAllActive}
        savedViews={savedViews}
        onLoadView={loadSavedView}
        onSaveView={saveCurrentView}
        onDeleteView={deleteSavedView}
        onImportFile={onImportFile}
        importMsg={importMsg}
      />

      {loadError && <Alert variant="error">{loadError}</Alert>}

      <div className="overflow-hidden rounded-xl border border-zinc-200 shadow-sm dark:border-zinc-800">
        <div className="max-h-[min(70vh,56rem)] overflow-y-auto">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="sticky top-0 z-20 w-[14%] border-b border-zinc-200 bg-zinc-50 px-2 py-2 pl-3 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Numer", "documentNumber")}
                </th>
                <th className="sticky top-0 z-20 w-[19%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Dostawca", "supplier")}
                </th>
                <th className="sticky top-0 z-20 w-[12%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Miejsce (konto 5)
                </th>
                <th className="sticky top-0 z-20 w-[14%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Klasyfikacja
                </th>
                <th className="sticky top-0 z-20 w-[10%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Do zapłaty", "grossAmount", "right")}
                </th>
                <th className="sticky top-0 z-20 w-[11%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Plan", "plannedPaymentDate")}
                </th>
                <th className="sticky top-0 z-20 w-[12%] border-b border-zinc-200 bg-zinc-50 px-1 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  {costSortTh("Status", "status")}
                </th>
                <th className="sticky top-0 z-20 w-[12%] border-b border-zinc-200 bg-zinc-50 px-2 py-2 pr-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Akcje
                </th>
              </tr>
            </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {listLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                  <Spinner className="mr-2 inline !size-5" />
                  Ładowanie…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-zinc-500">
                  Brak dokumentów kosztowych. Użyj <strong>Dodaj</strong>.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const overdue = costRowOverdue(r);
                const inv = r as unknown as CostInvoice;
                const pays = (r.payments ?? []) as unknown as PayPick[];
                const settled = sumCostPaymentsGross(pays);
                const remaining = costRemainingGross(inv, pays);
                return (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    onClick={handleRowClickOpenEdit(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openEdit(r);
                      }
                    }}
                    className={`group cursor-pointer bg-white align-top transition-colors hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900/80 ${
                      overdue ? "border-l-4 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20" : ""
                    }`}
                  >
                    <td className="min-w-0 px-2 py-2.5 pl-3">
                      <span className="inline-flex flex-wrap items-center gap-1 font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100">
                        <span className="break-all">{r.documentNumber}</span>
                        {overdue ? <Badge variant="warning">Po terminie</Badge> : null}
                      </span>
                      <CostListSubline r={r} settled={settled} remaining={remaining} />
                    </td>
                    <td className="min-w-0 px-1 py-2.5 text-sm text-zinc-800 dark:text-zinc-200" title={r.supplier}>
                      <span className="line-clamp-2 break-words">
                        <ContractorNameLink name={r.supplier} />
                      </span>
                    </td>
                    <td className="min-w-0 px-1 py-2.5 text-xs align-top">{costListPlaceCell(r)}</td>
                    <td className="min-w-0 px-1 py-2.5 align-top">{costListClassificationCell(r)}</td>
                    <td className="px-1 py-2.5 text-right text-sm tabular-nums text-zinc-800 dark:text-zinc-200">
                      {(() => {
                        const invPick = {
                          grossAmount: String(r.grossAmount),
                          amountToPayGross: r.amountToPayGross ?? null,
                        };
                        const paymentGross = costEffectivePaymentGross(invPick);
                        const split = costHasPaymentAmountSplit(invPick);
                        return (
                          <div>
                            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                              {formatMoney(paymentGross)}
                            </div>
                            {split ? (
                              <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                faktura {formatMoney(r.grossAmount)}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="min-w-0 px-1 py-2.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                      {r.plannedPaymentDate ? formatDate(r.plannedPaymentDate) : "—"}
                    </td>
                    <td className="min-w-0 px-1 py-2.5">{statusBadge(r.status)}</td>
                    <td className="px-2 py-2.5 pr-3 text-right align-top">
                      <div className="flex flex-col items-end gap-0.5 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          className="!h-auto !py-0.5 !px-1.5 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(r);
                          }}
                        >
                          Edytuj
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="!h-auto !py-0.5 !px-1.5 text-xs text-red-600 dark:text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(r.id);
                          }}
                        >
                          Usuń
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>
        </>
      ) : null}

      <Modal
        open={open}
        title={editing.id ? "Edycja faktury kosztowej" : "Nowa faktura kosztowa"}
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
              {editAccount5Preview ? (
                <p className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                  Podgląd konta 5:{" "}
                  <span className="font-mono font-semibold">
                    {formatAccount5Display(editAccount5Preview) ?? editAccount5Preview}
                  </span>
                </p>
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
    </div>
  );
}
