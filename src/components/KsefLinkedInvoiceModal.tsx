"use client";

import { NewCostInvoiceFormModal } from "@/components/CostInvoiceFormModal";
import { NewIncomeInvoiceFormModal } from "@/components/IncomeInvoiceFormModal";

const KSEF_INVOICE_MODAL_Z = "z-[70]";

export type KsefLinkedInvoiceModalProps = {
  kind: "cost" | "income" | null;
  invoiceId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export function KsefLinkedInvoiceModal({
  kind,
  invoiceId,
  open,
  onClose,
  onSaved,
}: KsefLinkedInvoiceModalProps) {
  if (!open || !kind || !invoiceId) return null;

  if (kind === "income") {
    return (
      <NewIncomeInvoiceFormModal
        open={open}
        invoiceId={invoiceId}
        contractorName=""
        onClose={onClose}
        onSaved={() => {
          onSaved();
          onClose();
        }}
        overlayZIndexClass={KSEF_INVOICE_MODAL_Z}
      />
    );
  }

  return (
    <NewCostInvoiceFormModal
      open={open}
      mode="edit"
      invoiceId={invoiceId}
      onClose={onClose}
      onSaved={() => {
        onSaved();
        onClose();
      }}
      overlayZIndexClass={KSEF_INVOICE_MODAL_Z}
    />
  );
}
