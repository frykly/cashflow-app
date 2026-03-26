import { Suspense } from "react";
import type { Metadata } from "next";
import { RecurringClient } from "@/components/RecurringClient";

export const metadata: Metadata = {
  title: "Reguły cykliczne",
  description: "Reguły cykliczne generują koszty i przychody jako zwykłe dokumenty.",
};

export default function RecurringPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Ładowanie…</div>}>
      <RecurringClient />
    </Suspense>
  );
}
