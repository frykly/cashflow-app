"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Badge, Button, Drawer, Spinner } from "@/components/ui";
import {
  KsefDocumentDetailActions,
  KsefDocumentDetailPanel,
  type KsefDocumentDetailPanelProps,
} from "@/components/KsefDocumentDetailPanel";
import type { KsefPaymentStatus } from "@/lib/ksef/payment-status";
import type { KsefDocumentDirection, KsefWorkflowStatus } from "@/lib/ksef/types";

type DrawerDocument = {
  id: string;
  invoiceNumber: string;
  workflowStatus: KsefWorkflowStatus;
  documentDirection: KsefDocumentDirection;
  paymentStatus: KsefPaymentStatus;
  paymentStatusLabel: string;
};

export type KsefDocumentDrawerProps = {
  open: boolean;
  document: DrawerDocument | null;
  index: number;
  total: number;
  detailLoading: boolean;
  detailProps: Omit<KsefDocumentDetailPanelProps, "hideActions"> | null;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  canPrevious: boolean;
  canNext: boolean;
};

function workflowBadge(status: KsefWorkflowStatus) {
  if (status === "NEW") return <Badge variant="default">Nowy</Badge>;
  if (status === "PROBABLE_DUPLICATE") return <Badge variant="warning">Już w systemie</Badge>;
  if (status === "IMPORTED") return <Badge variant="success">Zaimportowany</Badge>;
  return <Badge variant="muted">Odrzucony</Badge>;
}

function paymentBadge(status: KsefPaymentStatus, label: string) {
  if (status === "PAID") return <Badge variant="success">{label}</Badge>;
  if (status === "PARTIAL") return <Badge variant="warning">{label}</Badge>;
  if (status === "OVERDUE") return <Badge variant="danger">{label}</Badge>;
  if (status === "NOT_APPLICABLE") return <Badge variant="muted">{label}</Badge>;
  if (status === "NO_INVOICE") return <Badge variant="muted">{label}</Badge>;
  return <Badge variant="default">{label}</Badge>;
}

export function KsefDocumentDrawer({
  open,
  document,
  index,
  total,
  detailLoading,
  detailProps,
  onClose,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
}: KsefDocumentDrawerProps) {
  if (!open || !document) return null;

  const duplicateCostId = detailProps?.duplicateCost?.id ?? null;
  const duplicateIncomeId = detailProps?.duplicateIncome?.id ?? null;

  return (
    <Drawer open={open} onClose={onClose} aria-label={`Szczegóły faktury ${document.invoiceNumber}`}>
      <header className="shrink-0 border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              {document.invoiceNumber || "—"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {workflowBadge(document.workflowStatus)}
              {paymentBadge(document.paymentStatus, document.paymentStatusLabel)}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className="px-2"
              disabled={!canPrevious}
              onClick={onPrevious}
              aria-label="Poprzednia faktura"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Poprzednia</span>
            </Button>
            <span className="min-w-[3.5rem] text-center text-xs text-zinc-500">
              {total > 0 ? `${index + 1} / ${total}` : "—"}
            </span>
            <Button
              type="button"
              variant="ghost"
              className="px-2"
              disabled={!canNext}
              onClick={onNext}
              aria-label="Następna faktura"
            >
              <span className="hidden sm:inline">Następna</span>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="ml-1 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
              aria-label="Zamknij"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {detailProps ? (
          <div className="border-t border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <KsefDocumentDetailActions
              workflowStatus={detailProps.workflowStatus}
              importedAsCostInvoiceId={detailProps.importedAsCostInvoiceId}
              importedAsRevenueInvoiceId={detailProps.importedAsRevenueInvoiceId}
              duplicateCostId={duplicateCostId}
              duplicateIncomeId={duplicateIncomeId}
              acting={detailProps.acting}
              canImportCost={detailProps.canImportCost}
              canImportRevenue={detailProps.canImportRevenue}
              canUndoImport={detailProps.canUndoImport}
              importBlockedReason={detailProps.importBlockedReason}
              onAction={detailProps.onAction}
              compact
            />
          </div>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {detailLoading && !detailProps ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : detailProps ? (
          <KsefDocumentDetailPanel {...detailProps} hideActions />
        ) : (
          <p className="text-sm text-zinc-500">Nie udało się wczytać podglądu faktury.</p>
        )}
      </div>
    </Drawer>
  );
}
