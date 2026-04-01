import { IncomeInvoicesClient } from "@/components/IncomeInvoicesClient";
import { serializeSearchParamsRecord } from "@/lib/serialize-search-params";

export default async function IncomeInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <IncomeInvoicesClient initialQueryString={serializeSearchParamsRecord(sp)} />;
}
