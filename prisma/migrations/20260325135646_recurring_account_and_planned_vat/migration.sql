-- RedefineTables
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
    "incomeCategoryId" TEXT,
    "expenseCategoryId" TEXT,
    "recurringTemplateId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedFinancialEvent_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_recurringTemplateId_fkey" FOREIGN KEY ("recurringTemplateId") REFERENCES "RecurringTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlannedFinancialEvent" ("amount", "createdAt", "description", "expenseCategoryId", "id", "incomeCategoryId", "notes", "plannedDate", "recurringTemplateId", "status", "title", "type", "updatedAt") SELECT "amount", "createdAt", "description", "expenseCategoryId", "id", "incomeCategoryId", "notes", "plannedDate", "recurringTemplateId", "status", "title", "type", "updatedAt" FROM "PlannedFinancialEvent";
DROP TABLE "PlannedFinancialEvent";
ALTER TABLE "new_PlannedFinancialEvent" RENAME TO "PlannedFinancialEvent";
CREATE TABLE "new_RecurringTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountMode" TEXT NOT NULL DEFAULT 'MAIN',
    "amount" DECIMAL NOT NULL,
    "amountVat" DECIMAL,
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
INSERT INTO "new_RecurringTemplate" ("amount", "createdAt", "dayOfMonth", "endDate", "expenseCategoryId", "frequency", "id", "incomeCategoryId", "isActive", "notes", "startDate", "title", "type", "updatedAt", "weekday") SELECT "amount", "createdAt", "dayOfMonth", "endDate", "expenseCategoryId", "frequency", "id", "incomeCategoryId", "isActive", "notes", "startDate", "title", "type", "updatedAt", "weekday" FROM "RecurringTemplate";
DROP TABLE "RecurringTemplate";
ALTER TABLE "new_RecurringTemplate" RENAME TO "RecurringTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
