"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

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
 */
export function useListQuery(which: "income" | "cost" | "planned") {
  const defaults = LIST_DEFAULTS[which];
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const merged = useMemo(() => mergeWithDefaults(sp, defaults), [sp, defaults]);

  const queryString = merged.toString();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const m = mergeWithDefaults(sp, defaults);
      if (value === null || value === "") m.delete(key);
      else m.set(key, value);
      const s = m.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
    },
    [sp, router, pathname, defaults],
  );

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const m = mergeWithDefaults(sp, defaults);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") m.delete(key);
        else m.set(key, value);
      }
      const s = m.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
    },
    [sp, router, pathname, defaults],
  );

  return { queryString, setParam, setParams, merged };
}
