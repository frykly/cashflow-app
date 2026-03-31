-- PlannedFinancialEvent: konwersja na faktury (relacje opcjonalne, bez utraty danych)

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlannedFinancialEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL NOT NULL,
    "amountVat" DECIMAL NOT NULL DEFAULT 0,
    "plannedDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "projectName" TEXT,
    "projectId" TEXT,
    "incomeCategoryId" TEXT,
    "expenseCategoryId" TEXT,
    "convertedToIncomeInvoiceId" TEXT,
    "convertedToCostInvoiceId" TEXT,
    "convertedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedFinancialEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_convertedToIncomeInvoiceId_fkey" FOREIGN KEY ("convertedToIncomeInvoiceId") REFERENCES "IncomeInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_convertedToCostInvoiceId_fkey" FOREIGN KEY ("convertedToCostInvoiceId") REFERENCES "CostInvoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlannedFinancialEvent" ("amount", "amountVat", "createdAt", "description", "expenseCategoryId", "id", "incomeCategoryId", "notes", "plannedDate", "projectId", "projectName", "status", "title", "type", "updatedAt") SELECT "amount", "amountVat", "createdAt", "description", "expenseCategoryId", "id", "incomeCategoryId", "notes", "plannedDate", "projectId", "projectName", "status", "title", "type", "updatedAt" FROM "PlannedFinancialEvent";
DROP TABLE "PlannedFinancialEvent";
ALTER TABLE "new_PlannedFinancialEvent" RENAME TO "PlannedFinancialEvent";
CREATE UNIQUE INDEX "PlannedFinancialEvent_convertedToIncomeInvoiceId_key" ON "PlannedFinancialEvent"("convertedToIncomeInvoiceId");
CREATE UNIQUE INDEX "PlannedFinancialEvent_convertedToCostInvoiceId_key" ON "PlannedFinancialEvent"("convertedToCostInvoiceId");
CREATE INDEX "PlannedFinancialEvent_projectId_idx" ON "PlannedFinancialEvent"("projectId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
