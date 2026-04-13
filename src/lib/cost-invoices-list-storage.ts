const LAST_KEY = "cashflow-cost-list-query-v1";
const VIEWS_KEY = "cashflow-cost-saved-views-v1";

export type SavedCostListView = {
  id: string;
  name: string;
  /** Pełny query string (bez `?`), jak w URL listy kosztów */
  query: string;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadLastCostListQuery(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function saveLastCostListQuery(queryString: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_KEY, queryString);
  } catch {
    /* quota / private mode */
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
