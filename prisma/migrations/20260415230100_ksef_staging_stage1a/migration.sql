-- CreateTable
CREATE TABLE "KsefSyncSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KsefDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ksefId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "saleDate" DATETIME,
    "sellerName" TEXT NOT NULL,
    "sellerTaxId" TEXT NOT NULL DEFAULT '',
    "buyerName" TEXT NOT NULL,
    "buyerTaxId" TEXT NOT NULL DEFAULT '',
    "netAmount" DECIMAL NOT NULL,
    "vatAmount" DECIMAL NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "rawPayload" TEXT NOT NULL,
    "importedAsCostInvoiceId" TEXT,
    "importedAsRevenueInvoiceId" TEXT,
    "syncSessionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KsefDocument_syncSessionId_fkey" FOREIGN KEY ("syncSessionId") REFERENCES "KsefSyncSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "KsefDocument_ksefId_key" ON "KsefDocument"("ksefId");

-- CreateIndex
CREATE INDEX "KsefDocument_syncSessionId_idx" ON "KsefDocument"("syncSessionId");

-- CreateIndex
CREATE INDEX "KsefDocument_issueDate_idx" ON "KsefDocument"("issueDate");
