"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { NewIncomeInvoiceFormModal } from "@/components/IncomeInvoiceFormModal";

type Props = {
  children: React.ReactNode;
  contractorName: string | null;
  projectId: string;
  projectName: string;
  projectCode?: string | null;
  invoiceId?: string | null;
  className: string;
};

export function ProjectIncomeInvoiceModalButton({
  children,
  contractorName,
  projectId,
  projectName,
  projectCode,
  invoiceId = null,
  className,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <NewIncomeInvoiceFormModal
        open={open}
        contractorName={contractorName?.trim() ?? ""}
        projectId={projectId}
        projectName={projectName}
        projectCode={projectCode}
        invoiceId={invoiceId}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
