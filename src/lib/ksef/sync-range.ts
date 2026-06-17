import { prisma } from "@/lib/db";
import type { KsefDateRange } from "./types";

export const SYNC_OVERLAP_DAYS = 3;
export const SYNC_CHUNK_DAYS = 90;

export type SyncRangeRequest = {
  syncFrom?: string | null;
  syncTo?: string | null;
  forceRange?: boolean;
};

export function parseSyncFromInput(value: string): Date {
  const trimmed = value.trim();
  const d = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Nieprawidłowa data „Od”. Użyj formatu RRRR-MM-DD.");
  }
  return d;
}

export function parseSyncToInput(value: string): Date {
  const trimmed = value.trim();
  const d = new Date(`${trimmed}T23:59:59.999Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Nieprawidłowa data „Do”. Użyj formatu RRRR-MM-DD.");
  }
  return d;
}

export function subDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

/** Dzieli zakres na chunki ≤ maxDays (limit API KSeF). */
export function splitDateRangeIntoChunks(from: Date, to: Date, maxDays = SYNC_CHUNK_DAYS): KsefDateRange[] {
  if (to.getTime() <= from.getTime()) {
    return [{ from, to: new Date(to) }];
  }
  const chunks: KsefDateRange[] = [];
  let cursor = new Date(from);
  const end = new Date(to);
  while (cursor.getTime() < end.getTime()) {
    const chunkEndMs = Math.min(end.getTime(), cursor.getTime() + maxDays * 24 * 60 * 60 * 1000);
    const chunkEnd = new Date(chunkEndMs);
    chunks.push({ from: new Date(cursor), to: chunkEnd });
    if (chunkEndMs >= end.getTime()) break;
    cursor = chunkEnd;
  }
  return chunks.length > 0 ? chunks : [{ from, to: end }];
}

export type ResolvedSyncRange = KsefDateRange & {
  isFirstSync: boolean;
  chunks: KsefDateRange[];
};

/**
 * forceRange: jawny zakres Od/Do (testy, stub) — nie nadpisuje trybu incremental.
 * Pierwszy sync: syncFrom bez forceRange → zapis ksefInitialSyncFrom.
 * Kolejne standardowe: last syncRangeTo − overlap → dziś.
 */
export async function resolveSyncRange(req: SyncRangeRequest = {}): Promise<ResolvedSyncRange> {
  const to = new Date();
  const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  const lastSuccess = await prisma.ksefSyncSession.findFirst({
    where: { status: "SUCCEEDED", syncRangeTo: { not: null } },
    orderBy: { finishedAt: "desc" },
  });

  if (req.forceRange && req.syncFrom?.trim()) {
    const from = parseSyncFromInput(req.syncFrom);
    const rangeTo = req.syncTo?.trim() ? parseSyncToInput(req.syncTo) : to;
    const chunks = splitDateRangeIntoChunks(from, rangeTo);
    return { from, to: rangeTo, isFirstSync: false, chunks };
  }

  if (req.syncFrom?.trim()) {
    const from = parseSyncFromInput(req.syncFrom);
    if (!settings?.ksefInitialSyncFrom) {
      await prisma.appSettings.update({
        where: { id: 1 },
        data: { ksefInitialSyncFrom: from },
      });
    }
    const chunks = splitDateRangeIntoChunks(from, to);
    return { from, to, isFirstSync: true, chunks };
  }

  if (lastSuccess?.syncRangeTo) {
    const from = subDays(lastSuccess.syncRangeTo, SYNC_OVERLAP_DAYS);
    const chunks = splitDateRangeIntoChunks(from, to);
    return { from, to, isFirstSync: false, chunks };
  }

  if (settings?.ksefInitialSyncFrom) {
    const from = settings.ksefInitialSyncFrom;
    const chunks = splitDateRangeIntoChunks(from, to);
    return { from, to, isFirstSync: false, chunks };
  }

  throw new Error("Ustaw datę „Pobieraj od” przy pierwszym synchronizacji KSeF.");
}
