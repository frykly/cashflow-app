import { ProjectsClient } from "@/components/ProjectsClient";
import { serializeSearchParamsRecord } from "@/lib/serialize-search-params";

function firstParam(v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v || null;
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <ProjectsClient initialEditId={firstParam(sp.edit)} initialQueryString={serializeSearchParamsRecord(sp)} />;
}
