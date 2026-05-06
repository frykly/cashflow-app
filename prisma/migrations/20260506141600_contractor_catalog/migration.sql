-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "taxId" TEXT,
    "type" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContractorAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractorId" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractorAlias_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Contractor_normalizedName_idx" ON "Contractor"("normalizedName");

-- CreateIndex
CREATE INDEX "Contractor_taxId_idx" ON "Contractor"("taxId");

-- CreateIndex
CREATE INDEX "ContractorAlias_contractorId_idx" ON "ContractorAlias"("contractorId");

-- CreateIndex
CREATE INDEX "ContractorAlias_normalizedAlias_idx" ON "ContractorAlias"("normalizedAlias");
