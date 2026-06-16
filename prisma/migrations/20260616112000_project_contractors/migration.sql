-- CreateTable
CREATE TABLE "ProjectContractor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "role" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectContractor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectContractor_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContractor_projectId_contractorId_key" ON "ProjectContractor"("projectId", "contractorId");

-- CreateIndex
CREATE INDEX "ProjectContractor_projectId_idx" ON "ProjectContractor"("projectId");

-- CreateIndex
CREATE INDEX "ProjectContractor_contractorId_idx" ON "ProjectContractor"("contractorId");
