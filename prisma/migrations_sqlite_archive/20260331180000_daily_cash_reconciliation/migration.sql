-- CreateTable
CREATE TABLE "DailyCashReconciliation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayKey" TEXT NOT NULL,
    "mainBankBalance" DECIMAL NOT NULL,
    "vatBankBalance" DECIMAL NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCashReconciliation_dayKey_key" ON "DailyCashReconciliation"("dayKey");
