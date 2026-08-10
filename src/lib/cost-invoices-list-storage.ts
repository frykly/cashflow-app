import {
  clearPersistentListQuery,
  extractListNavigationParams,
  listQueryHasExplicitFilters,
  loadPersistentListQuery,
  mergeListQueryWithNavigation,
  PERSISTENT_LIST_STORAGE_KEYS,
  savePersistentListQuery,
  sanitizeListQueryForStorage,
  type PersistentListConfig,
} from "@/lib/persistent-list-state";

const VIEWS_KEY = "cashflow-cost-saved-views-v1";

export type SavedCostListView = {
  id: string;
  name: string;
  query: string;
};

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

export const COST_LIST_FILTER_KEYS = [
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

export const COST_LIST_PERSISTENCE_CONFIG: PersistentListConfig = {
  storageKey: PERSISTENT_LIST_STORAGE_KEYS.costInvoices,
  defaults: { sort: "plannedPaymentDate", order: "asc" },
  navKeys: COST_LIST_NAV_KEYS,
  filterKeys: COST_LIST_FILTER_KEYS,
  defaultSort: "plannedPaymentDate",
  defaultOrder: "asc",
  defaultDateField: "documentDate",
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const costListHasExplicitFilters = (sp: URLSearchParams) =>
  listQueryHasExplicitFilters(sp, COST_LIST_PERSISTENCE_CONFIG);

export const extractCostListNavigationParams = (sp: URLSearchParams) =>
  extractListNavigationParams(sp, COST_LIST_NAV_KEYS);

export const mergeCostListQueryWithNavigation = (savedQuery: string, nav: URLSearchParams) =>
  mergeListQueryWithNavigation(savedQuery, nav, COST_LIST_NAV_KEYS);

export const loadLastCostListQuery = () => loadPersistentListQuery(COST_LIST_PERSISTENCE_CONFIG.storageKey);

export const sanitizeCostListQueryForStorage = (queryString: string) =>
  sanitizeListQueryForStorage(queryString, COST_LIST_NAV_KEYS);

export const saveLastCostListQuery = (queryString: string) =>
  savePersistentListQuery(COST_LIST_PERSISTENCE_CONFIG.storageKey, queryString, COST_LIST_NAV_KEYS);

export const clearLastCostListQuery = () => clearPersistentListQuery(COST_LIST_PERSISTENCE_CONFIG.storageKey);

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

/** Filtry z panelu „Więcej filtrów” aktywne w URL (bez search/status/dat z głównego paska). */
export function costListAdvancedFilterCount(m: URLSearchParams): number {
  let n = 0;
  if (m.get("projectId")?.trim()) n++;
  if (m.get("costPlaceKind")?.trim()) n++;
  if (m.get("account4")?.trim()) n++;
  if (m.get("vehicleId")?.trim()) n++;
  if (m.get("paymentSource")?.trim()) n++;
  if (m.get("recurringSource")?.trim()) n++;
  if (m.get("uncategorized") === "1") n++;
  if (m.get("categories")?.trim() || m.get("categoryId")?.trim()) n++;
  if (m.get("overdue") === "1") n++;
  return n;
}

export function costListAdvancedFilterCountFromDraft(d: {
  projectId: string;
  costPlaceKind: string;
  account4: string;
  vehicleId: string;
  paymentSource: string;
  recurringSource: string;
  uncategorizedOnly: boolean;
  categoryIds: string[];
  overdueOnly: boolean;
}): number {
  let n = 0;
  if (d.projectId.trim()) n++;
  if (d.costPlaceKind.trim()) n++;
  if (d.account4.trim()) n++;
  if (d.vehicleId.trim()) n++;
  if (d.paymentSource.trim()) n++;
  if (d.recurringSource.trim()) n++;
  if (d.uncategorizedOnly) n++;
  if (d.categoryIds.length > 0) n++;
  if (d.overdueOnly) n++;
  return n;
}
