-- AlterTable
ALTER TABLE "IncomeInvoice" ADD COLUMN "projectName" TEXT;

-- AlterTable
ALTER TABLE "CostInvoice" ADD COLUMN "projectName" TEXT;

-- AlterTable
ALTER TABLE "PlannedFinancialEvent" ADD COLUMN "projectName" TEXT;
