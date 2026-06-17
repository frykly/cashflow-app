import { prisma } from "@/lib/db";
import { getKsefAuthDiagnostics } from "./auth";
import { getKsefConfig, shouldUseKsefHttpApi } from "./config";

/** Odpowiedź GET /api/ksef/status — diagnostyka + kontekst sync. */
export type KsefStatusResponse = {
  configuredDataSource: "STUB" | "API";
  ksefEnabled: boolean;
  apiBaseUrl: string;
  /** @deprecated Użyj ksefTokenConfigured */
  tokenConfigured: boolean;
  ksefTokenConfigured: boolean;
  ksefTokenLength: number | null;
  deprecatedAccessTokenEnvSet: boolean;
  accessSessionActive: boolean;
  accessExpiresAt: string | null;
  companyTaxIdConfigured: boolean;
  willUseRealApiNextSync: boolean;
  initialSyncFrom: string | null;
  needsInitialSyncFrom: boolean;
  lastSync: null | {
    status: string;
    message: string | null;
    startedAt: string;
    finishedAt: string | null;
    syncRangeFrom: string | null;
    syncRangeTo: string | null;
    documentsUpserted: number | null;
    effectiveSource: "MOCK" | "KSEF" | null;
    fallbackToStub: boolean;
  };
};

function parseEffectiveSourceFromMessage(
  message: string | null | undefined,
): "MOCK" | "KSEF" | null {
  if (!message) return null;
  const m = message.match(/Źródło:\s*(MOCK|KSEF)\b/i);
  if (!m) return null;
  return m[1].toUpperCase() === "KSEF" ? "KSEF" : "MOCK";
}

export async function getKsefStatusResponse(): Promise<KsefStatusResponse> {
  const cfg = getKsefConfig();
  const [settings, last] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 1 } }),
    prisma.ksefSyncSession.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);

  const lastSuccess = await prisma.ksefSyncSession.findFirst({
    where: { status: "SUCCEEDED" },
    orderBy: { finishedAt: "desc" },
  });

  const effectiveSource = parseEffectiveSourceFromMessage(last?.message);
  const configuredDataSource: "STUB" | "API" =
    cfg.dataSource === "api" ? "API" : "STUB";

  const fallbackToStub =
    last?.status === "SUCCEEDED" &&
    configuredDataSource === "API" &&
    effectiveSource === "MOCK";

  const needsInitialSyncFrom =
    !settings?.ksefInitialSyncFrom && !lastSuccess?.syncRangeTo;

  const authDiag = getKsefAuthDiagnostics();

  return {
    configuredDataSource,
    ksefEnabled: cfg.enabled,
    apiBaseUrl: cfg.apiBaseUrl,
    tokenConfigured: authDiag.ksefTokenConfigured,
    ksefTokenConfigured: authDiag.ksefTokenConfigured,
    ksefTokenLength: authDiag.ksefTokenLength,
    deprecatedAccessTokenEnvSet: authDiag.deprecatedAccessTokenEnvSet,
    accessSessionActive: authDiag.accessSessionActive,
    accessExpiresAt: authDiag.accessExpiresAt,
    companyTaxIdConfigured: Boolean(cfg.companyTaxId),
    willUseRealApiNextSync: shouldUseKsefHttpApi(cfg),
    initialSyncFrom: settings?.ksefInitialSyncFrom?.toISOString().slice(0, 10) ?? null,
    needsInitialSyncFrom,
    lastSync: last
      ? {
          status: last.status,
          message: last.message,
          startedAt: last.startedAt.toISOString(),
          finishedAt: last.finishedAt?.toISOString() ?? null,
          syncRangeFrom: last.syncRangeFrom?.toISOString() ?? null,
          syncRangeTo: last.syncRangeTo?.toISOString() ?? null,
          documentsUpserted: last.documentsUpserted,
          effectiveSource,
          fallbackToStub,
        }
      : null,
  };
}
