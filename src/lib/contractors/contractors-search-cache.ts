import { readApiErrorBody } from "@/lib/api-client";
import { normalizeContractorName } from "@/lib/contractors/normalize-contractor-name";

/** Poniżej tej długości (niepusty tekst) nie wołamy API — zwracamy []. Puste query = pełna lista (autocomplete). */
export const CONTRACTORS_SEARCH_MIN_Q_LEN = 2;

const CACHE_ALL = "\0__all__\0";

function cacheKey(qRaw: string): string {
  const t = qRaw.trim();
  if (!t) return CACHE_ALL;
  const n = normalizeContractorName(t);
  return n || t.toLowerCase();
}

const rowCache = new Map<string, unknown[]>();
const inflight = new Map<string, Promise<unknown[]>>();

function shouldSkipNetwork(qRaw: string): boolean {
  const t = qRaw.trim();
  return t.length > 0 && t.length < CONTRACTORS_SEARCH_MIN_Q_LEN;
}

async function fetchContractorsSearchUncached(qRaw: string): Promise<unknown[]> {
  const sp = new URLSearchParams();
  const t = qRaw.trim();
  if (t) sp.set("q", t);
  const res = await fetch(`/api/contractors${sp.toString() ? `?${sp.toString()}` : ""}`);
  const j = await res.json();
  if (!res.ok) throw new Error(readApiErrorBody(j));
  return Array.isArray(j) ? j : [];
}

/**
 * Wynik zapisu GET /api/contractors — deduplikacja po znormalizowanym query,
 * współdzielenie Promise in-flight, cache także dla pustej tablicy.
 */
export function fetchContractorsSearchCached(qRaw: string): Promise<unknown[]> {
  if (shouldSkipNetwork(qRaw)) {
    return Promise.resolve([]);
  }

  const key = cacheKey(qRaw);
  const hit = rowCache.get(key);
  if (hit !== undefined) return Promise.resolve(hit);

  let p = inflight.get(key);
  if (!p) {
    p = fetchContractorsSearchUncached(qRaw)
      .then((rows) => {
        rowCache.set(key, rows);
        inflight.delete(key);
        return rows;
      })
      .catch((e) => {
        inflight.delete(key);
        throw e;
      });
    inflight.set(key, p);
  }
  return p;
}

/** Natychmiastowy odczyt (bez sieci): undefined = nie ma w cache / trzeba fetch. */
export function peekContractorsSearchCache(qRaw: string): unknown[] | undefined {
  if (shouldSkipNetwork(qRaw)) return [];
  const key = cacheKey(qRaw);
  if (rowCache.has(key)) return rowCache.get(key)!;
  return undefined;
}

export function invalidateContractorsSearchCache(): void {
  rowCache.clear();
  inflight.clear();
}
