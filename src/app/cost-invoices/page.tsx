import { Suspense } from "react";
import { CostInvoicesClient } from "@/components/CostInvoicesClient";

export default function CostInvoicesPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Ładowanie…</div>}>
      <CostInvoicesClient />
    </Suspense>
  );
}
