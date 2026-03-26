import { Suspense } from "react";
import { ProjectsClient } from "@/components/ProjectsClient";

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Ładowanie…</div>}>
      <ProjectsClient />
    </Suspense>
  );
}
