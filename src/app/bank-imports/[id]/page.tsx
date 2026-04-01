import { Suspense } from "react";
import { BankImportDetailClient } from "@/components/BankImportDetailClient";

export default async function BankImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Ładowanie…</div>}>
      <BankImportDetailClient importId={id} />
    </Suspense>
  );
}
