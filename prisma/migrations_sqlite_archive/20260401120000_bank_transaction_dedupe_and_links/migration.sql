-- RedefineTables: SQLite — dodanie kolumn bez utraty danych
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "importId" TEXT NOT NULL,
    "bookingDate" DATETIME NOT NULL,
    "valueDate" DATETIME,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterpartyName" TEXT,
    "counterpartyAccount" TEXT,
    "accountType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedInvoiceId" TEXT,
    "linkedCostInvoiceId" TEXT,
    "createdCostId" TEXT,
    "dedupeKey" TEXT,
    CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankImport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_BankTransaction" (
    "id", "importId", "bookingDate", "valueDate", "amount", "currency", "description",
    "counterpartyName", "counterpartyAccount", "accountType", "status", "createdAt",
    "matchedInvoiceId", "linkedCostInvoiceId", "createdCostId", "dedupeKey"
)
SELECT
    "id", "importId", "bookingDate", "valueDate", "amount", "currency", "description",
    "counterpartyName", "counterpartyAccount", "accountType",
    CASE WHEN "status" = 'CREATED' THEN 'LINKED_COST' ELSE "status" END,
    "createdAt",
    "matchedInvoiceId", NULL, "createdCostId", NULL
FROM "BankTransaction";

DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";

CREATE INDEX "BankTransaction_importId_idx" ON "BankTransaction"("importId");
CREATE INDEX "BankTransaction_status_idx" ON "BankTransaction"("status");
CREATE UNIQUE INDEX "BankTransaction_dedupeKey_key" ON "BankTransaction"("dedupeKey");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
