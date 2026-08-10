const LAST_KEY = "cashflow-cost-list-query-v1";
const VIEWS_KEY = "cashflow-cost-saved-views-v1";

export type SavedCostListView = {
  id: string;
  name: string;
  /** Pełny query string (bez `?`), jak w URL listy kosztów */
  query: string;
};

/** Parametry nawigacji / deep link — nie są filtrami listy. */
export const COST_LIST_NAV_KEYS = [
  "editCost",
  "new",
  "convertPlannedEventId",
  "clientName",
  "projectName",
  "projectCode",
  "multiProject",
  "returnTo",
] as const;

const COST_LIST_FILTER_KEYS = [
  "q",
  "status",
  "categories",
  "categoryId",
  "uncategorized",
  "recurringSource",
  "projectId",
  "vehicleId",
  "costPlaceKind",
  "paymentSource",
  "account4",
  "dateFrom",
  "dateTo",
  "dateField",
  "overdue",
  "sort",
  "order",
] as const;

const DEFAULT_SORT = "plannedPaymentDate";
const DEFAULT_ORDER = "asc";
const DEFAULT_DATE_FIELD = "plannedPaymentDate";

function safeParse<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isNavProjectId(sp: URLSearchParams): boolean {
  return sp.get("new") === "1" || Boolean(sp.get("convertPlannedEventId")?.trim());
}

/** Czy URL zawiera jawne filtry/sortowanie listy (poza domyślnym sort/order). */
export function costListHasExplicitFilters(sp: URLSearchParams): boolean {
  for (const key of COST_LIST_FILTER_KEYS) {
    if (key === "projectId" && isNavProjectId(sp)) continue;
    const v = sp.get(key)?.trim();
    if (!v) continue;
    if (key === "sort" && v === DEFAULT_SORT) continue;
    if (key === "order" && v === DEFAULT_ORDER) continue;
    if (key === "dateField" && v === DEFAULT_DATE_FIELD) continue;
    return true;
  }
  return false;
}

/** Parametry otwarcia modala / prefilla formularza — zachowaj przy przywracaniu ostatniego widoku. */
export function extractCostListNavigationParams(sp: URLSearchParams): URLSearchParams {
  const nav = new URLSearchParams();
  for (const key of COST_LIST_NAV_KEYS) {
    const v = sp.get(key);
    if (v) nav.set(key, v);
  }
  if (isNavProjectId(sp)) {
    const pid = sp.get("projectId")?.trim();
    if (pid) nav.set("projectId", pid);
  }
  return nav;
}

/** Scal zapisany widok listy z parametrami nawigacji z bieżącego URL. */
export function mergeCostListQueryWithNavigation(savedQuery: string, nav: URLSearchParams): string {
  const merged = new URLSearchParams(savedQuery);
  for (const key of COST_LIST_NAV_KEYS) merged.delete(key);
  if (!isNavProjectId(nav)) {
    /* projectId z nav (prefill) nie nadpisuje filtra listy */
  } else {
    merged.delete("projectId");
  }
  for (const [k, v] of nav.entries()) {
    merged.set(k, v);
  }
  return merged.toString();
}

export function loadLastCostListQuery(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

/** Zapisz tylko filtry/sortowanie listy — bez parametrów modala / deep link. */
export function sanitizeCostListQueryForStorage(queryString: string): string {
  const sp = new URLSearchParams(queryString);
  for (const key of COST_LIST_NAV_KEYS) sp.delete(key);
  if (isNavProjectId(sp)) sp.delete("projectId");
  return sp.toString();
}

export function saveLastCostListQuery(queryString: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_KEY, sanitizeCostListQueryForStorage(queryString));
  } catch {
    /* quota / private mode */
  }
}

export function clearLastCostListQuery(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_KEY);
  } catch {
    /* */
  }
}

export function loadSavedCostListViews(): SavedCostListView[] {
  if (typeof window === "undefined") return [];
  return safeParse<SavedCostListView[]>(window.localStorage.getItem(VIEWS_KEY), []);
}

function persistViews(views: SavedCostListView[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  } catch {
    /* */
  }
}

export function addSavedCostListView(name: string, queryString: string): SavedCostListView {
  const id = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const row: SavedCostListView = { id, name: name.trim() || "Widok", query: queryString };
  const list = loadSavedCostListViews();
  list.push(row);
  persistViews(list);
  return row;
}

export function removeSavedCostListView(id: string): void {
  const list = loadSavedCostListViews().filter((v) => v.id !== id);
  persistViews(list);
}
