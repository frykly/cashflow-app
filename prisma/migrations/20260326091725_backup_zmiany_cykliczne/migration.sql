-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CostInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentNumber" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "vatRate" INTEGER NOT NULL DEFAULT 23,
    "netAmount" DECIMAL NOT NULL,
    "vatAmount" DECIMAL NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "documentDate" DATETIME NOT NULL,
    "paymentDueDate" DATETIME NOT NULL,
    "plannedPaymentDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "actualPaymentDate" DATETIME,
    "paymentSource" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "expenseCategoryId" TEXT,
    "sourceRecurringTemplateId" TEXT,
    "generatedOccurrenceDate" DATETIME,
    "isGeneratedFromRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isRecurringDetached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostInvoice_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostInvoice_sourceRecurringTemplateId_fkey" FOREIGN KEY ("sourceRecurringTemplateId") REFERENCES "RecurringTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CostInvoice" ("actualPaymentDate", "createdAt", "description", "documentDate", "documentNumber", "expenseCategoryId", "generatedOccurrenceDate", "grossAmount", "id", "isGeneratedFromRecurring", "isRecurringDetached", "netAmount", "notes", "paid", "paymentDueDate", "paymentSource", "plannedPaymentDate", "sourceRecurringTemplateId", "status", "supplier", "updatedAt", "vatAmount", "vatRate") SELECT "actualPaymentDate", "createdAt", "description", "documentDate", "documentNumber", "expenseCategoryId", "generatedOccurrenceDate", "grossAmount", "id", "isGeneratedFromRecurring", "isRecurringDetached", "netAmount", "notes", "paid", "paymentDueDate", "paymentSource", "plannedPaymentDate", "sourceRecurringTemplateId", "status", "supplier", "updatedAt", "vatAmount", "vatRate" FROM "CostInvoice";
DROP TABLE "CostInvoice";
ALTER TABLE "new_CostInvoice" RENAME TO "CostInvoice";
CREATE INDEX "CostInvoice_sourceRecurringTemplateId_idx" ON "CostInvoice"("sourceRecurringTemplateId");
CREATE INDEX "CostInvoice_generatedOccurrenceDate_idx" ON "CostInvoice"("generatedOccurrenceDate");
CREATE TABLE "new_IncomeInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "contractor" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "vatRate" INTEGER NOT NULL DEFAULT 23,
    "netAmount" DECIMAL NOT NULL,
    "vatAmount" DECIMAL NOT NULL,
    "grossAmount" DECIMAL NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "paymentDueDate" DATETIME NOT NULL,
    "plannedIncomeDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "vatDestination" TEXT NOT NULL,
    "confirmedIncome" BOOLEAN NOT NULL DEFAULT false,
    "actualIncomeDate" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "incomeCategoryId" TEXT,
    "sourceRecurringTemplateId" TEXT,
    "generatedOccurrenceDate" DATETIME,
    "isGeneratedFromRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isRecurringDetached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeInvoice_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncomeInvoice_sourceRecurringTemplateId_fkey" FOREIGN KEY ("sourceRecurringTemplateId") REFERENCES "RecurringTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IncomeInvoice" ("actualIncomeDate", "confirmedIncome", "contractor", "createdAt", "description", "generatedOccurrenceDate", "grossAmount", "id", "incomeCategoryId", "invoiceNumber", "isGeneratedFromRecurring", "isRecurringDetached", "issueDate", "netAmount", "notes", "paymentDueDate", "plannedIncomeDate", "sourceRecurringTemplateId", "status", "updatedAt", "vatAmount", "vatDestination", "vatRate") SELECT "actualIncomeDate", "confirmedIncome", "contractor", "createdAt", "description", "generatedOccurrenceDate", "grossAmount", "id", "incomeCategoryId", "invoiceNumber", "isGeneratedFromRecurring", "isRecurringDetached", "issueDate", "netAmount", "notes", "paymentDueDate", "plannedIncomeDate", "sourceRecurringTemplateId", "status", "updatedAt", "vatAmount", "vatDestination", "vatRate" FROM "IncomeInvoice";
DROP TABLE "IncomeInvoice";
ALTER TABLE "new_IncomeInvoice" RENAME TO "IncomeInvoice";
CREATE INDEX "IncomeInvoice_sourceRecurringTemplateId_idx" ON "IncomeInvoice"("sourceRecurringTemplateId");
CREATE INDEX "IncomeInvoice_generatedOccurrenceDate_idx" ON "IncomeInvoice"("generatedOccurrenceDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
