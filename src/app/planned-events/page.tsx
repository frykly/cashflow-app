import { Suspense } from "react";
import { PlannedEventsClient } from "@/components/PlannedEventsClient";

export default function PlannedEventsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Ładowanie…</div>}>
      <PlannedEventsClient />
    </Suspense>
  );
}
