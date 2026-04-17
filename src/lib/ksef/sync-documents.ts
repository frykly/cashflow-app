import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getKsefConfig } from "./config";
import { fetchKsefDocuments } from "./ksef-api-client";
import type { KsefInboundDocument } from "./types";

export type KsefSyncResult = {
  sessionId: string;
  status: "SUCCEEDED" | "FAILED";
  upserted: number;
  message?: string;
};

function mapUpsert(d: KsefInboundDocument, sessionId: string) {
  return {
    ksefId: d.ksefId,
    source: d.source,
    status: d.status,
    documentType: d.documentType,
    issueDate: d.issueDate,
    saleDate: d.saleDate,
    sellerName: d.sellerName,
    sellerTaxId: d.sellerTaxId,
    buyerName: d.buyerName,
    buyerTaxId: d.buyerTaxId,
    netAmount: new Prisma.Decimal(d.netAmount),
    vatAmount: new Prisma.Decimal(d.vatAmount),
    grossAmount: new Prisma.Decimal(d.grossAmount),
    currency: d.currency,
    rawPayload: d.rawPayload,
    syncSessionId: sessionId,
  };
}

/**
 * Ręczny sync: sesja → pobranie (API lub stub) → upsert po ksefId (brak duplikatów przy powtórzeniu).
 */
export async function runKsefSync(): Promise<KsefSyncResult> {
  const cfg = getKsefConfig();
  if (!cfg.enabled) {
    throw new Error("KSeF sync wyłączony (KSEF_ENABLED=false).");
  }

  const session = await prisma.ksefSyncSession.create({
    data: {
      status: "RUNNING",
      environment: cfg.environment,
    },
  });

  try {
    const outcome = await fetchKsefDocuments();
    const docs = outcome.documents;
    for (const d of docs) {
      const data = mapUpsert(d, session.id);
      await prisma.ksefDocument.upsert({
        where: { ksefId: d.ksefId },
        create: data,
        update: data,
      });
    }

    const message = `Zsynchronizowano ${docs.length} dokument(ów). Źródło: ${outcome.effectiveSource}. ${outcome.detail}`;
    await prisma.ksefSyncSession.update({
      where: { id: session.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        message,
      },
    });

    return { sessionId: session.id, status: "SUCCEEDED", upserted: docs.length, message };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ksefSyncSession.update({
      where: { id: session.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        message: msg,
      },
    });
    throw e;
  }
}
