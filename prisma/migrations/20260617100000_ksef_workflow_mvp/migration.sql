-- AlterTable AppSettings
ALTER TABLE "AppSettings" ADD COLUMN "ksefInitialSyncFrom" DATETIME;

-- AlterTable KsefSyncSession
ALTER TABLE "KsefSyncSession" ADD COLUMN "syncRangeFrom" DATETIME;
ALTER TABLE "KsefSyncSession" ADD COLUMN "syncRangeTo" DATETIME;
ALTER TABLE "KsefSyncSession" ADD COLUMN "documentsUpserted" INTEGER;

-- Redefine KsefDocument (SQLite: recreate table)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_KsefDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ksefId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "workflowStatus" TEXT NOT NULL DEFAULT 'NEW',
    "documentDirection" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "documentType" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL DEFAULT '',
    "issueDate" DATETIME NOT NULL,
    "saleDate" DATETIME,
    "paymentDueDate" DATETIME,
    "sellerName" TEXT NOT NULL,
    "sellerTaxId" TEXT NOT NULL DEFAULT '',
    "buyerName" TEXT NOT NULL,
    "buyerTaxId" TEXT NOT NULL DEFAULT '',
    "netAmount" DECIMAL NOT NULL,
    "vatAmount" DECIMAL NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "rawPayload" TEXT NOT NULL,
    "duplicateOfCostInvoiceId" TEXT,
    "duplicateMatchSummary" TEXT,
    "importedAsCostInvoiceId" TEXT,
    "importedAsRevenueInvoiceId" TEXT,
    "rejectedAt" DATETIME,
    "importedAt" DATETIME,
    "processedAt" DATETIME,
    "syncSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KsefDocument_syncSessionId_fkey" FOREIGN KEY ("syncSessionId") REFERENCES "KsefSyncSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_KsefDocument" (
    "id", "ksefId", "source", "workflowStatus", "documentDirection", "documentType",
    "invoiceNumber", "issueDate", "saleDate", "paymentDueDate",
    "sellerName", "sellerTaxId", "buyerName", "buyerTaxId",
    "netAmount", "vatAmount", "grossAmount", "currency", "rawPayload",
    "duplicateOfCostInvoiceId", "duplicateMatchSummary",
    "importedAsCostInvoiceId", "importedAsRevenueInvoiceId",
    "rejectedAt", "importedAt", "processedAt",
    "syncSessionId", "createdAt", "updatedAt"
)
SELECT
    "id", "ksefId", "source",
    CASE WHEN "status" = 'READY' OR "status" = '' OR "status" IS NULL THEN 'NEW' ELSE "status" END,
    'UNKNOWN',
    "documentType",
    '',
    "issueDate", "saleDate", NULL,
    "sellerName", "sellerTaxId", "buyerName", "buyerTaxId",
    "netAmount", "vatAmount", "grossAmount", "currency", "rawPayload",
    NULL, NULL,
    "importedAsCostInvoiceId", "importedAsRevenueInvoiceId",
    NULL, NULL, NULL,
    "syncSessionId", "createdAt", "updatedAt"
FROM "KsefDocument";

DROP TABLE "KsefDocument";
ALTER TABLE "new_KsefDocument" RENAME TO "KsefDocument";

CREATE UNIQUE INDEX "KsefDocument_ksefId_key" ON "KsefDocument"("ksefId");
CREATE INDEX "KsefDocument_syncSessionId_idx" ON "KsefDocument"("syncSessionId");
CREATE INDEX "KsefDocument_issueDate_idx" ON "KsefDocument"("issueDate");
CREATE INDEX "KsefDocument_workflowStatus_idx" ON "KsefDocument"("workflowStatus");
CREATE INDEX "KsefDocument_documentDirection_idx" ON "KsefDocument"("documentDirection");
CREATE INDEX "KsefDocument_invoiceNumber_idx" ON "KsefDocument"("invoiceNumber");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
