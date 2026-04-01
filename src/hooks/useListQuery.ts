"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const LIST_DEFAULTS: Record<"income" | "cost" | "planned", Record<string, string>> = {
  income: { sort: "plannedIncomeDate", order: "asc" },
  cost: { sort: "plannedPaymentDate", order: "asc" },
  planned: { sort: "plannedDate", order: "asc" },
};

function mergeWithDefaults(sp: URLSearchParams, defaults: Record<string, string>) {
  const m = new URLSearchParams(sp.toString());
  for (const [k, v] of Object.entries(defaults)) {
    if (!m.get(k)) m.set(k, v);
  }
  return m;
}

/**
 * Synchronizacja listy z query params; domyślne sort/order dopisywane do zapytania API.
 * `initialQueryString` pochodzi ze strony serwerowej — unika `useSearchParams()` (Suspense / wieczny fallback).
 */
export function useListQuery(
  which: "income" | "cost" | "planned",
  initialQueryString: string,
) {
  const defaults = LIST_DEFAULTS[which];
  const router = useRouter();
  const pathname = usePathname();

  const [merged, setMerged] = useState(() =>
    mergeWithDefaults(new URLSearchParams(initialQueryString), defaults),
  );

  useEffect(() => {
    setMerged(mergeWithDefaults(new URLSearchParams(initialQueryString), defaults));
  }, [initialQueryString, defaults]);

  const queryString = merged.toString();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const m = mergeWithDefaults(new URLSearchParams(merged.toString()), defaults);
      if (value === null || value === "") m.delete(key);
      else m.set(key, value);
      const s = m.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
      setMerged(m);
    },
    [merged, router, pathname, defaults],
  );

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const m = mergeWithDefaults(new URLSearchParams(merged.toString()), defaults);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") m.delete(key);
        else m.set(key, value);
      }
      const s = m.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
      setMerged(m);
    },
    [merged, router, pathname, defaults],
  );

  return { queryString, setParam, setParams, merged };
}
