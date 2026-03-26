-- CreateTable
CREATE TABLE "IncomeCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CostInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentNumber" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostInvoice_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CostInvoice" ("actualPaymentDate", "createdAt", "description", "documentDate", "documentNumber", "grossAmount", "id", "netAmount", "notes", "paid", "paymentDueDate", "paymentSource", "plannedPaymentDate", "status", "supplier", "updatedAt", "vatAmount") SELECT "actualPaymentDate", "createdAt", "description", "documentDate", "documentNumber", "grossAmount", "id", "netAmount", "notes", "paid", "paymentDueDate", "paymentSource", "plannedPaymentDate", "status", "supplier", "updatedAt", "vatAmount" FROM "CostInvoice";
DROP TABLE "CostInvoice";
ALTER TABLE "new_CostInvoice" RENAME TO "CostInvoice";
CREATE TABLE "new_IncomeInvoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceNumber" TEXT NOT NULL,
    "contractor" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeInvoice_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_IncomeInvoice" ("actualIncomeDate", "confirmedIncome", "contractor", "createdAt", "description", "grossAmount", "id", "invoiceNumber", "issueDate", "netAmount", "notes", "paymentDueDate", "plannedIncomeDate", "status", "updatedAt", "vatAmount", "vatDestination") SELECT "actualIncomeDate", "confirmedIncome", "contractor", "createdAt", "description", "grossAmount", "id", "invoiceNumber", "issueDate", "netAmount", "notes", "paymentDueDate", "plannedIncomeDate", "status", "updatedAt", "vatAmount", "vatDestination" FROM "IncomeInvoice";
DROP TABLE "IncomeInvoice";
ALTER TABLE "new_IncomeInvoice" RENAME TO "IncomeInvoice";
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedFinancialEvent_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlannedFinancialEvent" ("amount", "createdAt", "description", "id", "notes", "plannedDate", "status", "title", "type", "updatedAt") SELECT "amount", "createdAt", "description", "id", "notes", "plannedDate", "status", "title", "type", "updatedAt" FROM "PlannedFinancialEvent";
DROP TABLE "PlannedFinancialEvent";
ALTER TABLE "new_PlannedFinancialEvent" RENAME TO "PlannedFinancialEvent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "IncomeCategory_slug_key" ON "IncomeCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_slug_key" ON "ExpenseCategory"("slug");
