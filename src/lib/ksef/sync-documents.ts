import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getKsefConfig } from "./config";
import { applyDuplicateScanToDocument } from "./duplicate-match";
import { fetchKsefDocuments } from "./ksef-api-client";
import { resolveSyncRange } from "./sync-range";
import type { KsefInboundDocument } from "./types";

export type KsefSyncResult = {
  sessionId: string;
  status: "SUCCEEDED" | "FAILED";
  upserted: number;
  syncRangeFrom: string;
  syncRangeTo: string;
  message?: string;
};

const PROTECTED_WORKFLOW = new Set(["IMPORTED", "REJECTED"]);

function mapCreate(d: KsefInboundDocument, sessionId: string) {
  return {
    ksefId: d.ksefId,
    source: d.source,
    workflowStatus: "NEW",
    documentDirection: d.documentDirection,
    documentType: d.documentType,
    invoiceNumber: d.invoiceNumber,
    issueDate: d.issueDate,
    saleDate: d.saleDate,
    paymentDueDate: d.paymentDueDate,
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

function mapMetadataUpdate(d: KsefInboundDocument, sessionId: string) {
  return {
    source: d.source,
    documentDirection: d.documentDirection,
    documentType: d.documentType,
    invoiceNumber: d.invoiceNumber,
    issueDate: d.issueDate,
    saleDate: d.saleDate,
    paymentDueDate: d.paymentDueDate,
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
 * Ręczny sync: zakres dat → pobranie (API lub stub) → upsert po ksefId → skan duplikatów.
 */
export async function runKsefSync(syncFromOverride?: string | null): Promise<KsefSyncResult> {
  const cfg = getKsefConfig();
  if (!cfg.enabled) {
    throw new Error("KSeF sync wyłączony (KSEF_ENABLED=false).");
  }

  const range = await resolveSyncRange(syncFromOverride);

  const session = await prisma.ksefSyncSession.create({
    data: {
      status: "RUNNING",
      environment: cfg.environment,
      syncRangeFrom: range.from,
      syncRangeTo: range.to,
    },
  });

  try {
    const outcome = await fetchKsefDocuments(range.chunks);
    const docs = outcome.documents;
    const touchedIds: string[] = [];

    for (const d of docs) {
      const existing = await prisma.ksefDocument.findUnique({
        where: { ksefId: d.ksefId },
        select: { id: true, workflowStatus: true },
      });

      if (!existing) {
        const created = await prisma.ksefDocument.create({
          data: mapCreate(d, session.id),
        });
        touchedIds.push(created.id);
        continue;
      }

      if (PROTECTED_WORKFLOW.has(existing.workflowStatus)) {
        await prisma.ksefDocument.update({
          where: { id: existing.id },
          data: { syncSessionId: session.id },
        });
        continue;
      }

      await prisma.ksefDocument.update({
        where: { id: existing.id },
        data: mapMetadataUpdate(d, session.id),
      });
      touchedIds.push(existing.id);
    }

    for (const id of touchedIds) {
      await applyDuplicateScanToDocument(id);
    }

    const message = `Zsynchronizowano ${docs.length} dokument(ów). Źródło: ${outcome.effectiveSource}. ${outcome.detail}`;
    await prisma.ksefSyncSession.update({
      where: { id: session.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        message,
        documentsUpserted: docs.length,
      },
    });

    return {
      sessionId: session.id,
      status: "SUCCEEDED",
      upserted: docs.length,
      syncRangeFrom: range.from.toISOString(),
      syncRangeTo: range.to.toISOString(),
      message,
    };
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
