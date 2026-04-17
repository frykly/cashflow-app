import { getKsefConfig, shouldUseKsefHttpApi } from "./config";
import type { KsefInboundDocument } from "./types";

/** Wynik pobrania — pozwala zbudować czytelny komunikat sesji bez zgadywania po stronie sync. */
export type FetchKsefDocumentsOutcome = {
  documents: KsefInboundDocument[];
  /** MOCK | KSEF — zgodnie z polem `source` rekordów (przy fallbacku wszystkie są MOCK). */
  effectiveSource: "MOCK" | "KSEF";
  /** Krótki opis (stub, API, fallback). */
  detail: string;
};

/**
 * Stage 1A: brak HTTP — stabilne ksefId do weryfikacji deduplikacji przy kolejnych syncach.
 */
export async function fetchKsefDocumentsStub(): Promise<KsefInboundDocument[]> {
  const docs: KsefInboundDocument[] = [
    {
      ksefId: "MOCK-KSEF-001",
      source: "MOCK",
      status: "READY",
      documentType: "FA",
      issueDate: new Date("2026-04-14T12:00:00.000Z"),
      saleDate: new Date("2026-04-14T12:00:00.000Z"),
      sellerName: "EKSABIT SP. Z O.O.",
      sellerTaxId: "5833315322",
      buyerName: "P4 Spółka z Ograniczoną Odpowiedzialnością",
      buyerTaxId: "9512120077",
      netAmount: "12040.82",
      vatAmount: "2769.39",
      grossAmount: "14810.21",
      currency: "PLN",
      rawPayload: JSON.stringify({ mock: true, ksefId: "MOCK-KSEF-001", note: "stub invoice A" }),
    },
    {
      ksefId: "MOCK-KSEF-002",
      source: "MOCK",
      status: "READY",
      documentType: "FA",
      issueDate: new Date("2026-03-01T10:00:00.000Z"),
      saleDate: null,
      sellerName: "Dostawca Testowy Sp. z o.o.",
      sellerTaxId: "1111111111",
      buyerName: "P4 Spółka z Ograniczoną Odpowiedzialnością",
      buyerTaxId: "9512120077",
      netAmount: "1000.00",
      vatAmount: "230.00",
      grossAmount: "1230.00",
      currency: "PLN",
      rawPayload: JSON.stringify({ mock: true, ksefId: "MOCK-KSEF-002" }),
    },
    {
      ksefId: "MOCK-KSEF-003",
      source: "MOCK",
      status: "READY",
      documentType: "RO",
      issueDate: new Date("2026-02-15T08:00:00.000Z"),
      saleDate: new Date("2026-02-15T08:00:00.000Z"),
      sellerName: "P4 Spółka z Ograniczoną Odpowiedzialnością",
      sellerTaxId: "9512120077",
      buyerName: "Klient Końcowy SA",
      buyerTaxId: "5252445767",
      netAmount: "500.00",
      vatAmount: "115.00",
      grossAmount: "615.00",
      currency: "PLN",
      rawPayload: JSON.stringify({ mock: true, ksefId: "MOCK-KSEF-003" }),
    },
  ];
  return docs;
}

type InvoiceMetadataJson = {
  ksefNumber: string;
  invoiceNumber?: string;
  issueDate?: string;
  invoicingDate?: string;
  acquisitionDate?: string;
  permanentStorageDate?: string;
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

  return {
    ksefId: m.ksefNumber,
    source: "KSEF",
    status: "READY",
    documentType: documentTypeFrom(m),
    issueDate: parseIssueDate(m.issueDate),
    saleDate: sale,
    sellerName: sellerNameFrom(m),
    sellerTaxId: m.seller?.nip?.trim() ?? "",
    buyerName: buyerNameFrom(m),
    buyerTaxId: buyerTaxIdFrom(m),
    netAmount: fmtAmount(m.netAmount),
    vatAmount: fmtAmount(m.vatAmount),
    grossAmount: fmtAmount(m.grossAmount),
    currency: (m.currency?.trim() || "PLN").slice(0, 3),
    rawPayload: JSON.stringify(m),
  };
}

function buildQueryBody(cfg: ReturnType<typeof getKsefConfig>) {
  const to = new Date();
  const from = new Date(to.getTime() - cfg.lookbackDays * 24 * 60 * 60 * 1000);
  return {
    subjectType: cfg.querySubjectType,
    dateRange: {
      dateType: "PermanentStorage" as const,
      from: from.toISOString(),
      to: to.toISOString(),
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

/**
 * Pobranie metadanych faktur z API KSeF 2.x (POST `/invoices/query/metadata`), z paginacją.
 */
export async function fetchKsefDocumentsFromApi(): Promise<KsefInboundDocument[]> {
  const cfg = getKsefConfig();
  if (!cfg.accessToken) {
    throw new Error("KSeF API: brak KSEF_ACCESS_TOKEN.");
  }

  const base = cfg.apiBaseUrl.replace(/\/+$/, "");
  const body = buildQueryBody(cfg);
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
 * Główny entrypoint Stage 1B: API z Bearer tokenem z env albo bezpieczny stub.
 */
export async function fetchKsefDocuments(): Promise<FetchKsefDocumentsOutcome> {
  const cfg = getKsefConfig();

  if (cfg.dataSource === "stub") {
    const documents = await fetchKsefDocumentsStub();
    return {
      documents,
      effectiveSource: "MOCK",
      detail: "stub (KSEF_DATA_SOURCE=stub)",
    };
  }

  if (!shouldUseKsefHttpApi(cfg)) {
    const documents = await fetchKsefDocumentsStub();
    return {
      documents,
      effectiveSource: "MOCK",
      detail:
        "stub — KSEF_DATA_SOURCE=api, lecz brak KSEF_ACCESS_TOKEN (skonfiguruj env lub zostań przy stub)",
    };
  }

  const documents = await fetchKsefDocumentsFromApi();
  return {
    documents,
    effectiveSource: "KSEF",
    detail: `API ${cfg.apiBaseUrl} (${cfg.querySubjectType}, ${cfg.lookbackDays} dni wstecz)`,
  };
}
