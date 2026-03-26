import { Suspense } from "react";
import { IncomeInvoicesClient } from "@/components/IncomeInvoicesClient";

export default function IncomeInvoicesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Ładowanie…</div>}>
      <IncomeInvoicesClient />
    </Suspense>
  );
}
