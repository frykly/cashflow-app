-- Etap 1: alokacja dokumentów na wiele projektów (bez zmiany płatności / importu bankowego)

CREATE TABLE "CostInvoiceProjectAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costInvoiceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "netAmount" DECIMAL NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostInvoiceProjectAllocation_costInvoiceId_fkey" FOREIGN KEY ("costInvoiceId") REFERENCES "CostInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostInvoiceProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "IncomeInvoiceProjectAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incomeInvoiceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "netAmount" DECIMAL NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeInvoiceProjectAllocation_incomeInvoiceId_fkey" FOREIGN KEY ("incomeInvoiceId") REFERENCES "IncomeInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncomeInvoiceProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "PlannedEventProjectAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "plannedFinancialEventId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "amountVat" DECIMAL NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedEventProjectAllocation_plannedFinancialEventId_fkey" FOREIGN KEY ("plannedFinancialEventId") REFERENCES "PlannedFinancialEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlannedEventProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CostInvoiceProjectAllocation_costInvoiceId_idx" ON "CostInvoiceProjectAllocation"("costInvoiceId");
CREATE INDEX "CostInvoiceProjectAllocation_projectId_idx" ON "CostInvoiceProjectAllocation"("projectId");
CREATE INDEX "IncomeInvoiceProjectAllocation_incomeInvoiceId_idx" ON "IncomeInvoiceProjectAllocation"("incomeInvoiceId");
CREATE INDEX "IncomeInvoiceProjectAllocation_projectId_idx" ON "IncomeInvoiceProjectAllocation"("projectId");
CREATE INDEX "PlannedEventProjectAllocation_plannedFinancialEventId_idx" ON "PlannedEventProjectAllocation"("plannedFinancialEventId");
CREATE INDEX "PlannedEventProjectAllocation_projectId_idx" ON "PlannedEventProjectAllocation"("projectId");
