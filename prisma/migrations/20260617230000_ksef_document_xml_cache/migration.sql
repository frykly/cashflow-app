-- AlterTable
ALTER TABLE "KsefDocument" ADD COLUMN "xmlPayload" TEXT;
ALTER TABLE "KsefDocument" ADD COLUMN "xmlFetchedAt" DATETIME;
ALTER TABLE "KsefDocument" ADD COLUMN "xmlFetchStatus" TEXT;
ALTER TABLE "KsefDocument" ADD COLUMN "xmlFetchError" TEXT;
