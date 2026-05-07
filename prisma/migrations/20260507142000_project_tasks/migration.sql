-- Zadania operacyjne przypisane do projektu (ProjectTask).

CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "plannedDate" DATETIME,
    "assigneeName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "isDone" INTEGER NOT NULL DEFAULT 0,
    "doneAt" DATETIME,
    "priority" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ProjectTask_projectId_idx" ON "ProjectTask"("projectId");
