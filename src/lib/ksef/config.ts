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
   * JWT `accessToken` z nagłówka `Authorization: Bearer` (uzyskany poza aplikacją w Stage 1B).
   */
  accessToken: string | null;
  /**
   * `stub` — zawsze stub (Stage 1A).
   * `api` — próba HTTP; gdy brak tokenu lub błąd konfiguracji, klient może przełączyć na stub (patrz `ksef-api-client`).
   */
  dataSource: "stub" | "api";
  /** Typ podmiotu w zapytaniu metadanych (np. Subject2 = nabywca — faktury zakupu). */
  querySubjectType: KsefQuerySubjectType;
  /** Zakres dat wstecz (API ogranicza okres do ok. 3 miesięcy). */
  lookbackDays: number;
};

const DEFAULT_API_BASE = "https://api-test.ksef.mf.gov.pl/v2";

function parseDataSource(raw: string | undefined): "stub" | "api" {
  const v = raw?.trim().toLowerCase();
  if (v === "api") return "api";
  return "stub";
}

function parseSubjectType(raw: string | undefined): KsefQuerySubjectType {
  const v = raw?.trim();
  if (
    v === "Subject1" ||
    v === "Subject2" ||
    v === "Subject3" ||
    v === "SubjectAuthorized"
  ) {
    return v;
  }
  return "Subject2";
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
    accessToken: process.env.KSEF_ACCESS_TOKEN?.trim() || null,
    dataSource: parseDataSource(process.env.KSEF_DATA_SOURCE),
    querySubjectType: parseSubjectType(process.env.KSEF_QUERY_SUBJECT_TYPE),
    lookbackDays: parseLookbackDays(process.env.KSEF_SYNC_LOOKBACK_DAYS),
  };
}

/**
 * Czy próbować realnego API (wymaga tokenu i włączonego źródła `api`).
 */
export function shouldUseKsefHttpApi(cfg: KsefConfig): boolean {
  return cfg.enabled && cfg.dataSource === "api" && Boolean(cfg.accessToken);
}
