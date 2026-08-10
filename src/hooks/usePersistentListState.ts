"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearPersistentListQuery,
  listQueryHasExplicitFilters,
  mergeListQueryWithDefaults,
  resolvePersistentListQuery,
  savePersistentListQuery,
  type PersistentListConfig,
} from "@/lib/persistent-list-state";

/**
 * Query params listy z persystencją w localStorage.
 * Priorytet: jawne filtry w URL > ostatni zapis > domyślne.
 * Deep linki (navKeys) nie blokują przywracania filtrów.
 */
export function usePersistentListState(initialQueryString: string, config: PersistentListConfig) {
  const router = useRouter();
  const pathname = usePathname();
  const configRef = useRef(config);
  configRef.current = config;

  const [merged, setMerged] = useState(() =>
    mergeListQueryWithDefaults(new URLSearchParams(initialQueryString), config.defaults),
  );

  const bootstrappedRef = useRef(false);
  const persistEnabledRef = useRef(false);
  const lastInitialRef = useRef(initialQueryString);

  const queryString = merged.toString();

  // Jednorazowy bootstrap po hydracji — odczyt localStorage zanim włączymy zapis.
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const resolved = resolvePersistentListQuery(initialQueryString, configRef.current);
    const next = new URLSearchParams(resolved.queryString);
    setMerged(next);

    const urlMerged = mergeListQueryWithDefaults(
      new URLSearchParams(initialQueryString),
      configRef.current.defaults,
    );
    const needsUrlSync =
      resolved.source === "storage" && resolved.queryString !== urlMerged.toString();

    if (needsUrlSync) {
      router.replace(`${pathname}?${resolved.queryString}`);
    }

    persistEnabledRef.current = true;
  }, [initialQueryString, pathname, router]);

  // Zewnętrzna nawigacja z jawnymi filtrami w URL (np. shared link).
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (initialQueryString === lastInitialRef.current) return;
    lastInitialRef.current = initialQueryString;

    const fromUrl = new URLSearchParams(initialQueryString);
    if (!listQueryHasExplicitFilters(fromUrl, configRef.current)) return;

    setMerged(mergeListQueryWithDefaults(fromUrl, configRef.current.defaults));
  }, [initialQueryString]);

  // Zapis ostatniego widoku — dopiero po bootstrapie.
  useEffect(() => {
    if (!persistEnabledRef.current) return;
    savePersistentListQuery(configRef.current.storageKey, queryString, configRef.current.navKeys);
  }, [queryString]);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const m = mergeListQueryWithDefaults(new URLSearchParams(merged.toString()), configRef.current.defaults);
      if (value === null || value === "") m.delete(key);
      else m.set(key, value);
      const s = m.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
      setMerged(m);
    },
    [merged, router, pathname],
  );

  const setParams = useCallback(
    (updates: Record<string, string | null>) => {
      const m = mergeListQueryWithDefaults(new URLSearchParams(merged.toString()), configRef.current.defaults);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") m.delete(key);
        else m.set(key, value);
      }
      const s = m.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
      setMerged(m);
    },
    [merged, router, pathname],
  );

  const clearPersisted = useCallback(() => {
    clearPersistentListQuery(configRef.current.storageKey);
  }, []);

  const replaceQuery = useCallback(
    (raw: string) => {
      const m = mergeListQueryWithDefaults(new URLSearchParams(raw), configRef.current.defaults);
      const s = m.toString();
      router.replace(s ? `${pathname}?${s}` : pathname);
      setMerged(m);
      lastInitialRef.current = s;
    },
    [router, pathname],
  );

  return { queryString, setParam, setParams, merged, clearPersisted, replaceQuery };
}
