-- AlterTable: Project v2 — statusy, plan netto, daty (SQLite: statusy jako TEXT zgodne z walidacją aplikacji)

ALTER TABLE "Project" ADD COLUMN "lifecycleStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "settlementStatus" TEXT;
ALTER TABLE "Project" ADD COLUMN "plannedRevenueNet" DECIMAL;
ALTER TABLE "Project" ADD COLUMN "plannedCostNet" DECIMAL;
ALTER TABLE "Project" ADD COLUMN "startDate" DATETIME;
ALTER TABLE "Project" ADD COLUMN "endDate" DATETIME;
