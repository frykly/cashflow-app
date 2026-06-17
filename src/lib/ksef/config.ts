export type KsefQuerySubjectType =
  | "Subject1"
  | "Subject2"
  | "Subject3"
  | "SubjectAuthorized";

export type KsefConfig = {
  /** Domyślnie włączone; ustaw `false` aby zablokować sync (np. produkcja do czasu wdrożenia API). */
  enabled: boolean;
  environment: string;
  /**
   * Bazowy URL API wraz z prefiksem wersji, np. `https://api-test.ksef.mf.gov.pl/v2`.
   * Puste → używany jest domyślny host testowy z dokumentacji KSeF.
   */
  apiBaseUrl: string;
  /**
   * Token KSeF z Aplikacji Podatnika / MCU — wejście do flow `/auth/ksef-token`.
   * Nie używać bezpośrednio jako Bearer przy API metadanych.
   */
  ksefToken: string | null;
  /**
   * `stub` — zawsze stub (Stage 1A).
   * `api` — próba HTTP; gdy brak tokenu lub błąd konfiguracji, klient może przełączyć na stub (patrz `ksef-api-client`).
   */
  dataSource: "stub" | "api";
  /**
   * Legacy — pierwszy typ z {@link querySubjectTypes}; przy sync API domyślnie oba kierunki.
   * @deprecated Preferuj querySubjectTypes
   */
  querySubjectType: KsefQuerySubjectType;
  /** Typy podmiotu w zapytaniach metadanych (domyślnie Subject1 + Subject2). */
  querySubjectTypes: KsefQuerySubjectType[];
  /** Zakres dat wstecz (legacy env; incremental sync używa sync-range). */
  lookbackDays: number;
  /** NIP własnej firmy — klasyfikacja zakup/sprzedaż. */
  companyTaxId: string;
};

const DEFAULT_API_BASE = "https://api-test.ksef.mf.gov.pl/v2";

function parseDataSource(raw: string | undefined): "stub" | "api" {
  const v = raw?.trim().toLowerCase();
  if (v === "api") return "api";
  return "stub";
}

const VALID_SUBJECT_TYPES = new Set<KsefQuerySubjectType>([
  "Subject1",
  "Subject2",
  "Subject3",
  "SubjectAuthorized",
]);

const DEFAULT_QUERY_SUBJECT_TYPES: KsefQuerySubjectType[] = ["Subject2", "Subject1"];

function isSubjectType(v: string): v is KsefQuerySubjectType {
  return VALID_SUBJECT_TYPES.has(v as KsefQuerySubjectType);
}

/** Lista typów podmiotu do zapytań metadata — domyślnie kosztowe + przychodowe. */
export function resolveQuerySubjectTypes(): KsefQuerySubjectType[] {
  const listRaw = process.env.KSEF_QUERY_SUBJECT_TYPES?.trim();
  if (listRaw) {
    const parsed = listRaw
      .split(",")
      .map((s) => s.trim())
      .filter(isSubjectType);
    if (parsed.length > 0) return [...new Set(parsed)];
  }

  const singleRaw = process.env.KSEF_QUERY_SUBJECT_TYPE?.trim();
  if (singleRaw) {
    if (singleRaw.toUpperCase() === "BOTH") return [...DEFAULT_QUERY_SUBJECT_TYPES];
    if (isSubjectType(singleRaw)) return [singleRaw];
  }

  return [...DEFAULT_QUERY_SUBJECT_TYPES];
}

function parseLookbackDays(raw: string | undefined): number {
  const n = raw != null && raw !== "" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return 90;
  /** Limit dokumentacyjny KSeF: ok. 3 miesiące — nie przekraczamy bezpiecznie 93 dni. */
  return Math.min(n, 93);
}

/**
 * Normalizacja bazowego URL: bez końcowego `/`, z sufiksem `/v2` jeśli podano sam host.
 */
export function normalizeKsefApiBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_API_BASE;
  if (/\/v2$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v2`;
}

export function getKsefConfig(): KsefConfig {
  return {
    enabled: process.env.KSEF_ENABLED !== "false",
    environment: process.env.KSEF_ENVIRONMENT?.trim() || "test",
    apiBaseUrl: normalizeKsefApiBaseUrl(
      process.env.KSEF_API_BASE_URL?.trim() || "",
    ),
    ksefToken:
      process.env.KSEF_KSEF_TOKEN?.trim() ||
      process.env.KSEF_ACCESS_TOKEN?.trim() ||
      null,
    dataSource: parseDataSource(process.env.KSEF_DATA_SOURCE),
    querySubjectTypes: resolveQuerySubjectTypes(),
    querySubjectType: resolveQuerySubjectTypes()[0] ?? "Subject2",
    lookbackDays: parseLookbackDays(process.env.KSEF_SYNC_LOOKBACK_DAYS),
    companyTaxId: (process.env.KSEF_COMPANY_TAX_ID ?? "").replace(/\D/g, ""),
  };
}

/**
 * Czy próbować realnego API (wymaga tokenu i włączonego źródła `api`).
 */
export function shouldUseKsefHttpApi(cfg: KsefConfig): boolean {
  return (
    cfg.enabled &&
    cfg.dataSource === "api" &&
    Boolean(cfg.ksefToken) &&
    Boolean(cfg.companyTaxId)
  );
}
