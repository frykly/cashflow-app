import { prisma } from "@/lib/db";
import { getKsefConfig, shouldUseKsefHttpApi } from "./config";

/** Odpowiedź GET /api/ksef/status — tylko diagnostyka, bez sekretów. */
export type KsefStatusResponse = {
  configuredDataSource: "STUB" | "API";
  ksefEnabled: boolean;
  tokenConfigured: boolean;
  /** Czy przy następnym sync zostanie użyte HTTP API (env + token). */
  willUseRealApiNextSync: boolean;
  lastSync: null | {
    status: string;
    message: string | null;
    startedAt: string;
    finishedAt: string | null;
    /** Z parsowania komunikatu sukcesu (`Źródło: MOCK|KSEF`). */
    effectiveSource: "MOCK" | "KSEF" | null;
    /** true gdy skonfigurowano API, a ostatni udany sync poszedł w MOCK (typowo brak tokenu). */
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
  const last = await prisma.ksefSyncSession.findFirst({
    orderBy: { startedAt: "desc" },
  });

  const effectiveSource = parseEffectiveSourceFromMessage(last?.message);
  const configuredDataSource: "STUB" | "API" =
    cfg.dataSource === "api" ? "API" : "STUB";

  const fallbackToStub =
    last?.status === "SUCCEEDED" &&
    configuredDataSource === "API" &&
    effectiveSource === "MOCK";

  return {
    configuredDataSource,
    ksefEnabled: cfg.enabled,
    tokenConfigured: Boolean(cfg.accessToken),
    willUseRealApiNextSync: shouldUseKsefHttpApi(cfg),
    lastSync: last
      ? {
          status: last.status,
          message: last.message,
          startedAt: last.startedAt.toISOString(),
          finishedAt: last.finishedAt?.toISOString() ?? null,
          effectiveSource,
          fallbackToStub,
        }
      : null,
  };
}
