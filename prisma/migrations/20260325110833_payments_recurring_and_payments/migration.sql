-- CreateTable
CREATE TABLE "IncomeInvoicePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incomeInvoiceId" TEXT NOT NULL,
    "amountGross" DECIMAL NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncomeInvoicePayment_incomeInvoiceId_fkey" FOREIGN KEY ("incomeInvoiceId") REFERENCES "IncomeInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostInvoicePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "costInvoiceId" TEXT NOT NULL,
    "amountGross" DECIMAL NOT NULL,
    "paymentDate" DATETIME NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostInvoicePayment_costInvoiceId_fkey" FOREIGN KEY ("costInvoiceId") REFERENCES "CostInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurringTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "incomeCategoryId" TEXT,
    "expenseCategoryId" TEXT,
    "frequency" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "dayOfMonth" INTEGER,
    "weekday" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringTemplate_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecurringTemplate_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlannedFinancialEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL NOT NULL,
    "plannedDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "incomeCategoryId" TEXT,
    "expenseCategoryId" TEXT,
    "recurringTemplateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedFinancialEvent_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlannedFinancialEvent" ("amount", "createdAt", "description", "expenseCategoryId", "id", "incomeCategoryId", "notes", "plannedDate", "status", "title", "type", "updatedAt") SELECT "amount", "createdAt", "description", "expenseCategoryId", "id", "incomeCategoryId", "notes", "plannedDate", "status", "title", "type", "updatedAt" FROM "PlannedFinancialEvent";
DROP TABLE "PlannedFinancialEvent";
ALTER TABLE "new_PlannedFinancialEvent" RENAME TO "PlannedFinancialEvent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill: jedna wpłata na fakturę oznaczoną jako opłacona (kompatybilność wsteczna)
INSERT INTO "IncomeInvoicePayment" ("id", "incomeInvoiceId", "amountGross", "paymentDate", "notes", "createdAt")
SELECT lower(hex(randomblob(16))), "id", "grossAmount", COALESCE("actualIncomeDate", "plannedIncomeDate"), '', datetime('now')
FROM "IncomeInvoice" WHERE "status" = 'OPLACONA';

INSERT INTO "CostInvoicePayment" ("id", "costInvoiceId", "amountGross", "paymentDate", "notes", "createdAt")
SELECT lower(hex(randomblob(16))), "id", "grossAmount", COALESCE("actualPaymentDate", "plannedPaymentDate"), '', datetime('now')
FROM "CostInvoice" WHERE "paid" = 1;
