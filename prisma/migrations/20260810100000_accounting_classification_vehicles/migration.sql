-- AlterTable ExpenseCategory
ALTER TABLE "ExpenseCategory" ADD COLUMN "accountingCode" TEXT;
ALTER TABLE "ExpenseCategory" ADD COLUMN "accountingName" TEXT;
CREATE INDEX "ExpenseCategory_accountingCode_idx" ON "ExpenseCategory"("accountingCode");

-- CreateTable Vehicle
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "registrationNumber" TEXT NOT NULL,
    "name" TEXT,
    "make" TEXT,
    "model" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE INDEX "Vehicle_registrationNumber_idx" ON "Vehicle"("registrationNumber");
CREATE INDEX "Vehicle_isActive_idx" ON "Vehicle"("isActive");

-- AlterTable CostInvoiceProjectAllocation
ALTER TABLE "CostInvoiceProjectAllocation" ADD COLUMN "account5Code" TEXT;

-- AlterTable CostInvoice
ALTER TABLE "CostInvoice" ADD COLUMN "costPlaceKind" TEXT NOT NULL DEFAULT 'UNCLASSIFIED';
ALTER TABLE "CostInvoice" ADD COLUMN "account5Code" TEXT;
ALTER TABLE "CostInvoice" ADD COLUMN "accountingNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CostInvoice" ADD COLUMN "vehicleId" TEXT;
CREATE INDEX "CostInvoice_vehicleId_idx" ON "CostInvoice"("vehicleId");
CREATE INDEX "CostInvoice_costPlaceKind_idx" ON "CostInvoice"("costPlaceKind");
CREATE INDEX "CostInvoice_account5Code_idx" ON "CostInvoice"("account5Code");

-- Map known expense categories → 4xx (by name)
UPDATE "ExpenseCategory" SET "accountingCode" = '429-07', "accountingName" = 'Usługi leasingowe' WHERE "name" = 'Leasing';
UPDATE "ExpenseCategory" SET "accountingCode" = '411-02', "accountingName" = 'Zużycie paliwa' WHERE "name" = 'Paliwo';
UPDATE "ExpenseCategory" SET "accountingCode" = '429-08', "accountingName" = 'Usługi księgowe' WHERE "name" = 'Księgowość';
UPDATE "ExpenseCategory" SET "accountingCode" = '429-10', "accountingName" = 'Usługi bankowe' WHERE "name" = 'Opłaty bankowe';
UPDATE "ExpenseCategory" SET "accountingCode" = '464-01', "accountingName" = 'Ubezpieczenia majątkowe' WHERE "name" = 'Ubezpieczenia';
UPDATE "ExpenseCategory" SET "accountingCode" = '411-05', "accountingName" = 'Zużycie materiałów na budowy' WHERE "name" = 'Materiały budowlane';
UPDATE "ExpenseCategory" SET "accountingCode" = '429-11', "accountingName" = 'Usługi transportowe' WHERE "name" = 'Transport';
UPDATE "ExpenseCategory" SET "accountingCode" = '431', "accountingName" = 'Wynagrodzenia' WHERE "name" = 'Wynagrodzenia';
UPDATE "ExpenseCategory" SET "accountingCode" = '445-01', "accountingName" = 'Narzuty ZUS' WHERE "name" = 'ZUS';
UPDATE "ExpenseCategory" SET "accountingCode" = '461-07', "accountingName" = 'Pozostałe podatki i opłaty' WHERE "name" = 'Podatki';
UPDATE "ExpenseCategory" SET "accountingCode" = '429-13', "accountingName" = 'Pozostałe usługi obce' WHERE "name" = 'Usługi';
UPDATE "ExpenseCategory" SET "accountingCode" = '429-05', "accountingName" = 'Usługi informatyczne' WHERE "name" = 'Usługi w chmurze';
UPDATE "ExpenseCategory" SET "accountingCode" = '411-01', "accountingName" = 'Zużycie materiałów i energii' WHERE "name" = 'Biuro';
UPDATE "ExpenseCategory" SET "accountingCode" = '463-02', "accountingName" = 'Reklama w mediach' WHERE "name" = 'Marketing';
UPDATE "ExpenseCategory" SET "accountingCode" = '429-04', "accountingName" = 'Dzierżawy Telekomunikacyjne BIZNES' WHERE "name" = 'Dzierżawy infrastruktury';
UPDATE "ExpenseCategory" SET "accountingCode" = '461-08', "accountingName" = 'Podatki i opłaty NKUP' WHERE "name" = 'Mandaty';
UPDATE "ExpenseCategory" SET "accountingCode" = '411-03', "accountingName" = 'Materiały eksploatacyjne' WHERE "name" = 'Narzędzia';
UPDATE "ExpenseCategory" SET "accountingCode" = '469', "accountingName" = 'Pozostałe koszty proste' WHERE "name" = 'Inne';

-- Backfill PROJECT + 501 for invoices with projectId
UPDATE "CostInvoice"
SET
  "costPlaceKind" = 'PROJECT',
  "account5Code" = (
    SELECT '501-' || TRIM(p."code")
    FROM "Project" p
    WHERE p."id" = "CostInvoice"."projectId"
      AND p."code" IS NOT NULL
      AND TRIM(p."code") != ''
  )
WHERE "projectId" IS NOT NULL;

-- Invoices with allocations but no projectId → PROJECT
UPDATE "CostInvoice"
SET "costPlaceKind" = 'PROJECT'
WHERE "projectId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "CostInvoiceProjectAllocation" a
    WHERE a."costInvoiceId" = "CostInvoice"."id"
  );

-- Snapshot account5 on allocations
UPDATE "CostInvoiceProjectAllocation"
SET "account5Code" = (
  SELECT '501-' || TRIM(p."code")
  FROM "Project" p
  WHERE p."id" = "CostInvoiceProjectAllocation"."projectId"
    AND p."code" IS NOT NULL
    AND TRIM(p."code") != ''
);

-- For PROJECT invoices without account5Code yet, take first allocation snapshot
UPDATE "CostInvoice"
SET "account5Code" = (
  SELECT a."account5Code"
  FROM "CostInvoiceProjectAllocation" a
  WHERE a."costInvoiceId" = "CostInvoice"."id"
    AND a."account5Code" IS NOT NULL
  ORDER BY a."createdAt" ASC
  LIMIT 1
)
WHERE "costPlaceKind" = 'PROJECT'
  AND "account5Code" IS NULL;
