import { prisma } from "@/lib/db";
import { getKsefConfig, shouldUseKsefHttpApi } from "./config";
import { fetchInvoiceXmlFromKsefApi } from "./ksef-api-client";

export type FetchXmlResult = {
  documentId: string;
  xmlFetchStatus: "OK";
  xmlFetchedAt: string;
  cached: boolean;
};

export async function fetchAndCacheKsefDocumentXml(
  documentId: string,
  options?: { force?: boolean },
): Promise<FetchXmlResult> {
  const doc = await prisma.ksefDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Nie znaleziono dokumentu KSeF.");

  if (!options?.force && doc.xmlFetchStatus === "OK" && doc.xmlPayload?.trim()) {
    return {
      documentId: doc.id,
      xmlFetchStatus: "OK",
      xmlFetchedAt: doc.xmlFetchedAt?.toISOString() ?? new Date().toISOString(),
      cached: true,
    };
  }

  const cfg = getKsefConfig();
  if (!cfg.enabled) {
    throw new Error("KSeF sync wyłączony (KSEF_ENABLED=false).");
  }
  if (doc.source === "MOCK" || !shouldUseKsefHttpApi(cfg)) {
    throw new Error(
      "Pobieranie XML dostępne tylko dla dokumentów z realnego API KSeF (nie tryb STUB/MOCK).",
    );
  }

  try {
    const xml = await fetchInvoiceXmlFromKsefApi(doc.ksefId);
    if (!xml.trim()) {
      throw new Error("KSeF zwróciło pusty dokument XML.");
    }

    const now = new Date();
    await prisma.ksefDocument.update({
      where: { id: doc.id },
      data: {
        xmlPayload: xml,
        xmlFetchedAt: now,
        xmlFetchStatus: "OK",
        xmlFetchError: null,
      },
    });

    return {
      documentId: doc.id,
      xmlFetchStatus: "OK",
      xmlFetchedAt: now.toISOString(),
      cached: false,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ksefDocument.update({
      where: { id: doc.id },
      data: {
        xmlFetchStatus: "FAILED",
        xmlFetchError: msg.slice(0, 2000),
      },
    });
    throw new Error(msg);
  }
}
