import { Suspense } from "react";
import { BankImportsClient } from "@/components/BankImportsClient";

export default function BankImportsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Ładowanie…</div>}>
      <BankImportsClient />
    </Suspense>
  );
}
