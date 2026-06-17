import { getKsefConfig, shouldUseKsefHttpApi } from "./config";
import { classifyDocumentDirection } from "./document-direction";
import type { KsefDateRange, KsefInboundDocument } from "./types";

/** Wynik pobrania — pozwala zbudować czytelny komunikat sesji bez zgadywania po stronie sync. */
export type FetchKsefDocumentsOutcome = {
  documents: KsefInboundDocument[];
  /** MOCK | KSEF — zgodnie z polem `source` rekordów (przy fallbacku wszystkie są MOCK). */
  effectiveSource: "MOCK" | "KSEF";
  /** Krótki opis (stub, API, fallback). */
  detail: string;
};

function invoiceNumberFromPayload(raw: Record<string, unknown>, fallback: string): string {
  const n = raw.invoiceNumber;
  if (typeof n === "string" && n.trim()) return n.trim();
  return fallback;
}

function stubDoc(
  partial: Omit<KsefInboundDocument, "documentDirection"> & { documentDirection?: KsefInboundDocument["documentDirection"] },
): KsefInboundDocument {
  const direction =
    partial.documentDirection ??
    classifyDocumentDirection({
      sellerTaxId: partial.sellerTaxId,
      buyerTaxId: partial.buyerTaxId,
    });
  return { ...partial, documentDirection: direction };
}

/**
 * Stage 1A stub — stabilne ksefId; filtrowane po zakresie issueDate.
 */
export async function fetchKsefDocumentsStub(range: KsefDateRange): Promise<KsefInboundDocument[]> {
  const all: KsefInboundDocument[] = [
    stubDoc({
      ksefId: "MOCK-KSEF-001",
      source: "MOCK",
      documentType: "FA",
      invoiceNumber: "FV/MOCK/001/2026",
      issueDate: new Date("2026-04-14T12:00:00.000Z"),
      saleDate: new Date("2026-04-14T12:00:00.000Z"),
      paymentDueDate: new Date("2026-04-28T12:00:00.000Z"),
      sellerName: "EKSABIT SP. Z O.O.",
      sellerTaxId: "5833315322",
      buyerName: "P4 Spółka z Ograniczoną Odpowiedzialnością",
      buyerTaxId: "9512120077",
      netAmount: "12040.82",
      vatAmount: "2769.39",
      grossAmount: "14810.21",
      currency: "PLN",
      rawPayload: JSON.stringify({
        mock: true,
        ksefId: "MOCK-KSEF-001",
        invoiceNumber: "FV/MOCK/001/2026",
      }),
    }),
    stubDoc({
      ksefId: "MOCK-KSEF-002",
      source: "MOCK",
      documentType: "FA",
      invoiceNumber: "FV/MOCK/002/2026",
      issueDate: new Date("2026-03-01T10:00:00.000Z"),
      saleDate: null,
      paymentDueDate: null,
      sellerName: "Dostawca Testowy Sp. z o.o.",
      sellerTaxId: "1111111111",
      buyerName: "P4 Spółka z Ograniczoną Odpowiedzialnością",
      buyerTaxId: "9512120077",
      netAmount: "1000.00",
      vatAmount: "230.00",
      grossAmount: "1230.00",
      currency: "PLN",
      rawPayload: JSON.stringify({
        mock: true,
        ksefId: "MOCK-KSEF-002",
        invoiceNumber: "FV/MOCK/002/2026",
      }),
    }),
    stubDoc({
      ksefId: "MOCK-KSEF-003",
      source: "MOCK",
      documentType: "RO",
      invoiceNumber: "FV/MOCK/SALE/003/2026",
      issueDate: new Date("2026-02-15T08:00:00.000Z"),
      saleDate: new Date("2026-02-15T08:00:00.000Z"),
      paymentDueDate: null,
      sellerName: "P4 Spółka z Ograniczoną Odpowiedzialnością",
      sellerTaxId: "9512120077",
      buyerName: "Klient Końcowy SA",
      buyerTaxId: "5252445767",
      netAmount: "500.00",
      vatAmount: "115.00",
      grossAmount: "615.00",
      currency: "PLN",
      rawPayload: JSON.stringify({
        mock: true,
        ksefId: "MOCK-KSEF-003",
        invoiceNumber: "FV/MOCK/SALE/003/2026",
      }),
      documentDirection: "SALE",
    }),
  ];

  return all.filter((d) => d.issueDate >= range.from && d.issueDate <= range.to);
}

type InvoiceMetadataJson = {
  ksefNumber: string;
  invoiceNumber?: string;
  issueDate?: string;
  invoicingDate?: string;
  acquisitionDate?: string;
  permanentStorageDate?: string;
  paymentDate?: string;
  seller?: { nip?: string; name?: string | null };
  buyer?: {
    identifier?: { type?: string; value?: string | null };
    name?: string | null;
  };
  netAmount?: number;
  grossAmount?: number;
  vatAmount?: number;
  currency?: string;
  formCode?: { value?: string; systemCode?: string; schemaVersion?: string };
  invoiceType?: string;
};

type QueryInvoicesMetadataResponse = {
  hasMore: boolean;
  isTruncated: boolean;
  invoices: InvoiceMetadataJson[];
};

function fmtAmount(n: number | undefined): string {
  if (n == null || Number.isNaN(n)) return "0.00";
  return n.toFixed(2);
}

function parseOptionalDateTime(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseIssueDate(dateStr: string | undefined): Date {
  if (!dateStr) return new Date(0);
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

function buyerTaxIdFrom(m: InvoiceMetadataJson): string {
  const v = m.buyer?.identifier?.value;
  return v?.trim() ?? "";
}

function sellerNameFrom(m: InvoiceMetadataJson): string {
  return m.seller?.name?.trim() ?? "";
}

function buyerNameFrom(m: InvoiceMetadataJson): string {
  return m.buyer?.name?.trim() ?? "";
}

function documentTypeFrom(m: InvoiceMetadataJson): string {
  return m.formCode?.value?.trim() || m.invoiceType?.trim() || "UNKNOWN";
}

function mapMetadataToInbound(m: InvoiceMetadataJson): KsefInboundDocument {
  const sale =
    parseOptionalDateTime(m.invoicingDate) ??
    parseOptionalDateTime(m.permanentStorageDate) ??
    parseOptionalDateTime(m.acquisitionDate);
  const paymentDueDate = parseOptionalDateTime(m.paymentDate);
  const sellerTaxId = m.seller?.nip?.trim() ?? "";
  const buyerTaxId = buyerTaxIdFrom(m);

  return {
    ksefId: m.ksefNumber,
    source: "KSEF",
    documentType: documentTypeFrom(m),
    invoiceNumber: m.invoiceNumber?.trim() ?? "",
    issueDate: parseIssueDate(m.issueDate),
    saleDate: sale,
    paymentDueDate,
    sellerName: sellerNameFrom(m),
    sellerTaxId,
    buyerName: buyerNameFrom(m),
    buyerTaxId,
    netAmount: fmtAmount(m.netAmount),
    vatAmount: fmtAmount(m.vatAmount),
    grossAmount: fmtAmount(m.grossAmount),
    currency: (m.currency?.trim() || "PLN").slice(0, 3),
    rawPayload: JSON.stringify(m),
    documentDirection: classifyDocumentDirection({ sellerTaxId, buyerTaxId }),
  };
}

function buildQueryBody(range: KsefDateRange, subjectType: ReturnType<typeof getKsefConfig>["querySubjectType"]) {
  return {
    subjectType,
    dateRange: {
      dateType: "PermanentStorage" as const,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    },
  };
}

async function readKsefErrorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as {
      detail?: string;
      title?: string;
      status?: number;
    };
    const line =
      j.detail || j.title || (typeof j.status === "number" ? `HTTP ${j.status}` : null);
    if (line) return `${res.status} ${line}`;
  } catch {
    /* ignore */
  }
  const head = text.slice(0, 500);
  return `${res.status} ${res.statusText}${head ? ` — ${head}` : ""}`;
}

async function fetchKsefDocumentsFromApiForRange(range: KsefDateRange): Promise<KsefInboundDocument[]> {
  const cfg = getKsefConfig();
  if (!cfg.accessToken) {
    throw new Error("KSeF API: brak KSEF_ACCESS_TOKEN.");
  }

  const base = cfg.apiBaseUrl.replace(/\/+$/, "");
  const body = buildQueryBody(range, cfg.querySubjectType);
  const collected: KsefInboundDocument[] = [];

  let pageOffset = 0;
  const pageSize = 250;

  for (;;) {
    const url = new URL(`${base}/invoices/query/metadata`);
    url.searchParams.set("pageOffset", String(pageOffset));
    url.searchParams.set("pageSize", String(pageSize));
    url.searchParams.set("sortOrder", "Asc");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.accessToken}`,
        "X-Error-Format": "problem-details",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`KSeF API: ${await readKsefErrorMessage(res)}`);
    }

    const json = (await res.json()) as QueryInvoicesMetadataResponse;
    if (!Array.isArray(json.invoices)) {
      throw new Error("KSeF API: nieoczekiwany kształt odpowiedzi (brak tablicy invoices).");
    }

    for (const inv of json.invoices) {
      collected.push(mapMetadataToInbound(inv));
    }

    if (json.isTruncated) {
      throw new Error(
        "KSeF API: wynik obcięty (≥10 000 rekordów). Zawęż zakres dat lub skontaktuj się z utrzymaniem.",
      );
    }

    if (!json.hasMore) break;
    pageOffset += 1;
  }

  return collected;
}

/**
 * Pobranie metadanych dla wielu chunków dat (≤90 dni każdy).
 */
export async function fetchKsefDocumentsFromApi(chunks: KsefDateRange[]): Promise<KsefInboundDocument[]> {
  const byKsefId = new Map<string, KsefInboundDocument>();
  for (const chunk of chunks) {
    const batch = await fetchKsefDocumentsFromApiForRange(chunk);
    for (const doc of batch) {
      byKsefId.set(doc.ksefId, doc);
    }
  }
  return [...byKsefId.values()];
}

/**
 * Główny entrypoint: API z Bearer tokenem z env albo bezpieczny stub.
 */
export async function fetchKsefDocuments(chunks: KsefDateRange[]): Promise<FetchKsefDocumentsOutcome> {
  const cfg = getKsefConfig();
  const rangeLabel = chunks
    .map((c) => `${c.from.toISOString().slice(0, 10)}…${c.to.toISOString().slice(0, 10)}`)
    .join(", ");

  if (cfg.dataSource === "stub") {
    const documents: KsefInboundDocument[] = [];
    for (const chunk of chunks) {
      documents.push(...(await fetchKsefDocumentsStub(chunk)));
    }
    const unique = [...new Map(documents.map((d) => [d.ksefId, d])).values()];
    return {
      documents: unique,
      effectiveSource: "MOCK",
      detail: `stub (KSEF_DATA_SOURCE=stub), zakres: ${rangeLabel}`,
    };
  }

  if (!shouldUseKsefHttpApi(cfg)) {
    const documents: KsefInboundDocument[] = [];
    for (const chunk of chunks) {
      documents.push(...(await fetchKsefDocumentsStub(chunk)));
    }
    const unique = [...new Map(documents.map((d) => [d.ksefId, d])).values()];
    return {
      documents: unique,
      effectiveSource: "MOCK",
      detail: `stub — brak tokenu; zakres: ${rangeLabel}`,
    };
  }

  const documents = await fetchKsefDocumentsFromApi(chunks);
  return {
    documents,
    effectiveSource: "KSEF",
    detail: `API ${cfg.apiBaseUrl} (${cfg.querySubjectType}), zakres: ${rangeLabel}`,
  };
}

export { invoiceNumberFromPayload };
