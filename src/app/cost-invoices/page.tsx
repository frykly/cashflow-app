import { CostInvoicesClient } from "@/components/CostInvoicesClient";
import { serializeSearchParamsRecord } from "@/lib/serialize-search-params";

export default async function CostInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <CostInvoicesClient initialQueryString={serializeSearchParamsRecord(sp)} />;
}
