import type { Metadata } from "next";
import { RecurringClient } from "@/components/RecurringClient";
import { serializeSearchParamsRecord } from "@/lib/serialize-search-params";

export const metadata: Metadata = {
  title: "Reguły cykliczne",
  description: "Reguły cykliczne generują koszty i przychody jako zwykłe dokumenty.",
};

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  return <RecurringClient initialQueryString={serializeSearchParamsRecord(sp)} />;
}
