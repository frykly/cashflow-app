/** Wyświetlanie przy braku lub niepoprawnej dacie */
export const DATE_EMPTY = "—";

function isValidDate(d: Date): boolean {
  return d instanceof Date && !Number.isNaN(d.getTime());
}

/**
 * Bezpieczne formatowanie daty do podglądu (lista, dashboard).
 * null / undefined / "" / niepoprawny format → "—", bez wyjątków.
 */
export function safeFormatDate(value: unknown): string {
  if (value === null || value === undefined) return DATE_EMPTY;
  if (typeof value === "string" && value.trim() === "") return DATE_EMPTY;
  const d = value instanceof Date ? value : new Date(String(value));
  if (!isValidDate(d)) return DATE_EMPTY;
  try {
    return new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "medium",
    }).format(d);
  } catch {
    return DATE_EMPTY;
  }
}

/** @deprecated Użyj safeFormatDate — zachowane dla kompatybilności importów */
export function formatDate(value: unknown): string {
  return safeFormatDate(value);
}

/**
 * Klucz dnia YYYY-MM-DD → czytelna data; niepoprawny klucz → "—"
 */
export function safeFormatDayKey(dayKey: unknown): string {
  if (dayKey === null || dayKey === undefined) return DATE_EMPTY;
  const s = String(dayKey).trim();
  if (s === "") return DATE_EMPTY;
  const parts = s.split("-");
  if (parts.length !== 3) return DATE_EMPTY;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return DATE_EMPTY;
  const dt = new Date(y, m - 1, d);
  if (!isValidDate(dt)) return DATE_EMPTY;
  try {
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(dt);
  } catch {
    return DATE_EMPTY;
  }
}

export function formatDayKey(dayKey: unknown): string {
  return safeFormatDayKey(dayKey);
}

/**
 * Wartość dla input[type=datetime-local]; pusta / niepoprawna → ""
 */
export function toDatetimeLocal(iso: string | undefined | null): string {
  if (iso === null || iso === undefined) return "";
  const s = String(iso).trim();
  if (s === "") return "";
  const d = new Date(s);
  if (!isValidDate(d)) return "";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Z pola datetime-local → ISO; puste → "" (formularz wyczyścił pole)
 */
export function fromDatetimeLocal(s: string): string {
  const t = s.trim();
  if (t === "") return "";
  const d = new Date(t);
  if (!isValidDate(d)) return "";
  return d.toISOString();
}

/** Opcjonalna data w żądaniu API: pusto / niepoprawnie → null. Obsługuje YYYY-MM-DD (→ południe UTC). */
export function toIsoOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const t = String(value).trim();
  if (t === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T12:00:00.000Z`;
  const d = new Date(t);
  if (!isValidDate(d)) return null;
  return d.toISOString();
}

export function formatMoney(n: unknown): string {
  const num = typeof n === "number" ? n : Number(n);
  if (typeof num !== "number" || Number.isNaN(num)) return DATE_EMPTY;
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: "PLN",
      minimumFractionDigits: 2,
    }).format(num);
  } catch {
    return DATE_EMPTY;
  }
}
