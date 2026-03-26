-- Projekty v1: model Project + projectId; migracja z legacy projectName (pole projectName zostaje)

CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "clientName" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- Unikalne niepuste nazwy z trzech tabel → jeden wiersz Project na nazwę (po TRIM)
INSERT INTO "Project" ("id", "name", "code", "clientName", "description", "isActive", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), s."nm", NULL, NULL, NULL, 1, datetime('now'), datetime('now')
FROM (
    SELECT DISTINCT TRIM("projectName") AS "nm" FROM "CostInvoice" WHERE "projectName" IS NOT NULL AND TRIM("projectName") != ''
    UNION
    SELECT DISTINCT TRIM("projectName") AS "nm" FROM "IncomeInvoice" WHERE "projectName" IS NOT NULL AND TRIM("projectName") != ''
    UNION
    SELECT DISTINCT TRIM("projectName") AS "nm" FROM "PlannedFinancialEvent" WHERE "projectName" IS NOT NULL AND TRIM("projectName") != ''
) AS s;

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
    "projectName" TEXT,
    "projectId" TEXT,
    "expenseCategoryId" TEXT,
    "sourceRecurringTemplateId" TEXT,
    "generatedOccurrenceDate" DATETIME,
    "isGeneratedFromRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isRecurringDetached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostInvoice_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CostInvoice_sourceRecurringTemplateId_fkey" FOREIGN KEY ("sourceRecurringTemplateId") REFERENCES "RecurringTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CostInvoice" ("actualPaymentDate", "createdAt", "description", "documentDate", "documentNumber", "expenseCategoryId", "generatedOccurrenceDate", "grossAmount", "id", "isGeneratedFromRecurring", "isRecurringDetached", "netAmount", "notes", "paid", "paymentDueDate", "paymentSource", "plannedPaymentDate", "projectName", "projectId", "sourceRecurringTemplateId", "status", "supplier", "updatedAt", "vatAmount", "vatRate")
SELECT "actualPaymentDate", "createdAt", "description", "documentDate", "documentNumber", "expenseCategoryId", "generatedOccurrenceDate", "grossAmount", "id", "isGeneratedFromRecurring", "isRecurringDetached", "netAmount", "notes", "paid", "paymentDueDate", "paymentSource", "plannedPaymentDate", "projectName",
    (SELECT "p"."id" FROM "Project" AS "p" WHERE "p"."name" = TRIM("CostInvoice"."projectName") LIMIT 1),
    "sourceRecurringTemplateId", "status", "supplier", "updatedAt", "vatAmount", "vatRate"
FROM "CostInvoice";
DROP TABLE "CostInvoice";
ALTER TABLE "new_CostInvoice" RENAME TO "CostInvoice";
CREATE INDEX "CostInvoice_sourceRecurringTemplateId_idx" ON "CostInvoice"("sourceRecurringTemplateId");
CREATE INDEX "CostInvoice_generatedOccurrenceDate_idx" ON "CostInvoice"("generatedOccurrenceDate");
CREATE INDEX "CostInvoice_projectId_idx" ON "CostInvoice"("projectId");

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
    "projectName" TEXT,
    "projectId" TEXT,
    "incomeCategoryId" TEXT,
    "sourceRecurringTemplateId" TEXT,
    "generatedOccurrenceDate" DATETIME,
    "isGeneratedFromRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isRecurringDetached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncomeInvoice_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "IncomeInvoice_sourceRecurringTemplateId_fkey" FOREIGN KEY ("sourceRecurringTemplateId") REFERENCES "RecurringTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IncomeInvoice" ("actualIncomeDate", "confirmedIncome", "contractor", "createdAt", "description", "generatedOccurrenceDate", "grossAmount", "id", "incomeCategoryId", "invoiceNumber", "isGeneratedFromRecurring", "isRecurringDetached", "issueDate", "netAmount", "notes", "paymentDueDate", "plannedIncomeDate", "projectName", "projectId", "sourceRecurringTemplateId", "status", "updatedAt", "vatAmount", "vatDestination", "vatRate")
SELECT "actualIncomeDate", "confirmedIncome", "contractor", "createdAt", "description", "generatedOccurrenceDate", "grossAmount", "id", "incomeCategoryId", "invoiceNumber", "isGeneratedFromRecurring", "isRecurringDetached", "issueDate", "netAmount", "notes", "paymentDueDate", "plannedIncomeDate", "projectName",
    (SELECT "p"."id" FROM "Project" AS "p" WHERE "p"."name" = TRIM("IncomeInvoice"."projectName") LIMIT 1),
    "sourceRecurringTemplateId", "status", "updatedAt", "vatAmount", "vatDestination", "vatRate"
FROM "IncomeInvoice";
DROP TABLE "IncomeInvoice";
ALTER TABLE "new_IncomeInvoice" RENAME TO "IncomeInvoice";
CREATE INDEX "IncomeInvoice_sourceRecurringTemplateId_idx" ON "IncomeInvoice"("sourceRecurringTemplateId");
CREATE INDEX "IncomeInvoice_generatedOccurrenceDate_idx" ON "IncomeInvoice"("generatedOccurrenceDate");
CREATE INDEX "IncomeInvoice_projectId_idx" ON "IncomeInvoice"("projectId");

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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedFinancialEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlannedFinancialEvent" ("amount", "amountVat", "createdAt", "description", "expenseCategoryId", "id", "incomeCategoryId", "notes", "plannedDate", "projectName", "projectId", "status", "title", "type", "updatedAt")
SELECT "amount", "amountVat", "createdAt", "description", "expenseCategoryId", "id", "incomeCategoryId", "notes", "plannedDate", "projectName",
    (SELECT "p"."id" FROM "Project" AS "p" WHERE "p"."name" = TRIM("PlannedFinancialEvent"."projectName") LIMIT 1),
    "status", "title", "type", "updatedAt"
FROM "PlannedFinancialEvent";
DROP TABLE "PlannedFinancialEvent";
ALTER TABLE "new_PlannedFinancialEvent" RENAME TO "PlannedFinancialEvent";
CREATE INDEX "PlannedFinancialEvent_projectId_idx" ON "PlannedFinancialEvent"("projectId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
