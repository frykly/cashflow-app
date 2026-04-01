import { PlannedEventsClient } from "@/components/PlannedEventsClient";
import { serializeSearchParamsRecord } from "@/lib/serialize-search-params";

export default async function PlannedEventsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <PlannedEventsClient initialQueryString={serializeSearchParamsRecord(sp)} />;
}
