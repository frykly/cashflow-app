-- ProjectTask: plannedDate -> plannedStartDate / plannedEndDate (dane: end = stary plannedDate).

ALTER TABLE "ProjectTask" ADD COLUMN "plannedStartDate" DATETIME;
ALTER TABLE "ProjectTask" ADD COLUMN "plannedEndDate" DATETIME;

UPDATE "ProjectTask" SET "plannedEndDate" = "plannedDate" WHERE "plannedDate" IS NOT NULL;

ALTER TABLE "ProjectTask" DROP COLUMN "plannedDate";
