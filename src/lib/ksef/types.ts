/** Źródło rekordu w stagingu (stub vs przyszłe API). */
export type KsefDocumentSource = "MOCK" | "KSEF";

/** Kształt dokumentu z warstwy pobrania (stub / później HTTP) przed zapisem Prisma. */
export type KsefInboundDocument = {
  ksefId: string;
  source: KsefDocumentSource;
  status: string;
  documentType: string;
  issueDate: Date;
  saleDate: Date | null;
  sellerName: string;
  sellerTaxId: string;
  buyerName: string;
  buyerTaxId: string;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  currency: string;
  rawPayload: string;
};
