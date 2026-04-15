-- CreateTable
CREATE TABLE "CostInvoicePaymentProjectAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costInvoicePaymentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostInvoicePaymentProjectAllocation_costInvoicePaymentId_fkey" FOREIGN KEY ("costInvoicePaymentId") REFERENCES "CostInvoicePayment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CostInvoicePaymentProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IncomeInvoicePaymentProjectAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incomeInvoicePaymentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeInvoicePaymentProjectAllocation_incomeInvoicePaymentId_fkey" FOREIGN KEY ("incomeInvoicePaymentId") REFERENCES "IncomeInvoicePayment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "IncomeInvoicePaymentProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CostInvoicePaymentProjectAllocation_costInvoicePaymentId_idx" ON "CostInvoicePaymentProjectAllocation"("costInvoicePaymentId");

-- CreateIndex
CREATE INDEX "CostInvoicePaymentProjectAllocation_projectId_idx" ON "CostInvoicePaymentProjectAllocation"("projectId");

-- CreateIndex
CREATE INDEX "IncomeInvoicePaymentProjectAllocation_incomeInvoicePaymentId_idx" ON "IncomeInvoicePaymentProjectAllocation"("incomeInvoicePaymentId");

-- CreateIndex
CREATE INDEX "IncomeInvoicePaymentProjectAllocation_projectId_idx" ON "IncomeInvoicePaymentProjectAllocation"("projectId");
