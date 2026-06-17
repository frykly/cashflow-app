/** Źródło rekordu w stagingu (stub vs API). */
export type KsefDocumentSource = "MOCK" | "KSEF";

export type KsefWorkflowStatus = "NEW" | "PROBABLE_DUPLICATE" | "IMPORTED" | "REJECTED";

export type KsefDocumentDirection = "PURCHASE" | "SALE" | "UNKNOWN";

/** Kształt dokumentu z warstwy pobrania przed zapisem Prisma. */
export type KsefInboundDocument = {
  ksefId: string;
  source: KsefDocumentSource;
  documentType: string;
  invoiceNumber: string;
  issueDate: Date;
  saleDate: Date | null;
  paymentDueDate: Date | null;
  sellerName: string;
  sellerTaxId: string;
  buyerName: string;
  buyerTaxId: string;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  rawPayload: string;
  documentDirection: KsefDocumentDirection;
};

export type KsefDateRange = {
  from: Date;
  to: Date;
};
