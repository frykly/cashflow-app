/** Wspólna logika persystencji query string list (localStorage + URL). */

export type PersistentListDefaults = Record<string, string>;

export type PersistentListConfig = {
  /** Klucz localStorage, np. cashflow-cost-list-query-v1 */
  storageKey: string;
  /** Domyślne parametry (sort, order, …) — dopisywane gdy brak w URL/zapisie */
  defaults: PersistentListDefaults;
  /** Parametry nawigacji / deep link — nie są filtrami listy */
  navKeys: readonly string[];
  /** Parametry filtrów/sortowania listy */
  filterKeys: readonly string[];
  defaultSort?: string;
  defaultOrder?: string;
  defaultDateField?: string;
};

function isNavProjectId(sp: URLSearchParams): boolean {
  return sp.get("new") === "1" || Boolean(sp.get("convertPlannedEventId")?.trim());
}

export function mergeListQueryWithDefaults(
  sp: URLSearchParams,
  defaults: PersistentListDefaults,
): URLSearchParams {
  const m = new URLSearchParams(sp.toString());
  for (const [k, v] of Object.entries(defaults)) {
    if (!m.get(k)) m.set(k, v);
  }
  return m;
}

/** Czy URL zawiera jawne filtry/sort (poza domyślnymi wartościami). */
export function listQueryHasExplicitFilters(sp: URLSearchParams, config: PersistentListConfig): boolean {
  const defaultSort = config.defaultSort ?? config.defaults.sort;
  const defaultOrder = config.defaultOrder ?? config.defaults.order ?? "asc";
  const defaultDateField = config.defaultDateField ?? "plannedPaymentDate";

  for (const key of config.filterKeys) {
    if (key === "projectId" && isNavProjectId(sp)) continue;
    const v = sp.get(key)?.trim();
    if (!v) continue;
    if (key === "sort" && defaultSort && v === defaultSort) continue;
    if (key === "order" && v === defaultOrder) continue;
    if (key === "dateField" && v === defaultDateField) continue;
    return true;
  }
  return false;
}

export function extractListNavigationParams(
  sp: URLSearchParams,
  navKeys: readonly string[],
): URLSearchParams {
  const nav = new URLSearchParams();
  for (const key of navKeys) {
    const v = sp.get(key);
    if (v) nav.set(key, v);
  }
  if (isNavProjectId(sp)) {
    const pid = sp.get("projectId")?.trim();
    if (pid) nav.set("projectId", pid);
  }
  return nav;
}

export function mergeListQueryWithNavigation(
  savedQuery: string,
  nav: URLSearchParams,
  navKeys: readonly string[],
): string {
  const merged = new URLSearchParams(savedQuery);
  for (const key of navKeys) merged.delete(key);
  if (isNavProjectId(nav)) merged.delete("projectId");
  for (const [k, v] of nav.entries()) merged.set(k, v);
  return merged.toString();
}

export function sanitizeListQueryForStorage(
  queryString: string,
  navKeys: readonly string[],
): string {
  const sp = new URLSearchParams(queryString);
  for (const key of navKeys) sp.delete(key);
  if (isNavProjectId(sp)) sp.delete("projectId");
  return sp.toString();
}

export function loadPersistentListQuery(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

export function savePersistentListQuery(
  storageKey: string,
  queryString: string,
  navKeys: readonly string[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, sanitizeListQueryForStorage(queryString, navKeys));
  } catch {
    /* quota / private mode */
  }
}

export function clearPersistentListQuery(storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    /* */
  }
}

/** Rozstrzyga stan listy: URL z filtrami > localStorage > URL/domysły. */
export function resolvePersistentListQuery(
  initialQueryString: string,
  config: PersistentListConfig,
): { queryString: string; source: "url" | "storage" | "defaults" } {
  const fromUrl = new URLSearchParams(initialQueryString);

  if (listQueryHasExplicitFilters(fromUrl, config)) {
    return {
      queryString: mergeListQueryWithDefaults(fromUrl, config.defaults).toString(),
      source: "url",
    };
  }

  const saved = loadPersistentListQuery(config.storageKey);
  if (saved?.trim()) {
    const nav = extractListNavigationParams(fromUrl, config.navKeys);
    const merged = mergeListQueryWithNavigation(saved, nav, config.navKeys);
    return {
      queryString: mergeListQueryWithDefaults(new URLSearchParams(merged), config.defaults).toString(),
      source: "storage",
    };
  }

  return {
    queryString: mergeListQueryWithDefaults(fromUrl, config.defaults).toString(),
    source: "defaults",
  };
}

/** Predefiniowane klucze storage pod kolejne moduły (reuse później). */
export const PERSISTENT_LIST_STORAGE_KEYS = {
  costInvoices: "cashflow-cost-list-query-v1",
  incomeInvoices: "cashflow-income-list-query-v1",
  projects: "cashflow-projects-list-query-v1",
  contractors: "cashflow-contractors-list-query-v1",
  ksefInbox: "cashflow-ksef-inbox-list-query-v1",
  plannedEvents: "cashflow-planned-events-list-query-v1",
  bankImports: "cashflow-bank-imports-list-query-v1",
} as const;
