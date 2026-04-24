-- AlterTable
ALTER TABLE "DailyCashReconciliation" ADD COLUMN "mainChecked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DailyCashReconciliation" ADD COLUMN "vatChecked" BOOLEAN NOT NULL DEFAULT false;
