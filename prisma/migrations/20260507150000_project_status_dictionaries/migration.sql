-- Słowniki statusów projektu + braki (M:N). Seed: istniejące slugi + nowe pozycje z Etapu 1.

CREATE TABLE "ProjectLifecycleStatusOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProjectLifecycleStatusOption_slug_key" ON "ProjectLifecycleStatusOption"("slug");

CREATE TABLE "ProjectSettlementStatusOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProjectSettlementStatusOption_slug_key" ON "ProjectSettlementStatusOption"("slug");

CREATE TABLE "ProjectMissingTypeOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ProjectMissingTypeOption_slug_key" ON "ProjectMissingTypeOption"("slug");

CREATE TABLE "ProjectMissingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "missingTypeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMissingItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectMissingItem_missingTypeId_fkey" FOREIGN KEY ("missingTypeId") REFERENCES "ProjectMissingTypeOption" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ProjectMissingItem_projectId_missingTypeId_key" ON "ProjectMissingItem"("projectId", "missingTypeId");
CREATE INDEX "ProjectMissingItem_projectId_idx" ON "ProjectMissingItem"("projectId");
CREATE INDEX "ProjectMissingItem_missingTypeId_idx" ON "ProjectMissingItem"("missingTypeId");

-- Seed: realizacja (legacy + rozszerzenia)
INSERT INTO "ProjectLifecycleStatusOption" ("id", "name", "slug", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
('plfc001', 'Nowy', 'NEW', 10, 1, datetime('now'), datetime('now')),
('plfc002', 'W trakcie', 'IN_PROGRESS', 20, 1, datetime('now'), datetime('now')),
('plfc003', 'W trakcie odbioru', 'FOR_HANDOFF', 30, 1, datetime('now'), datetime('now')),
('plfc004', 'Zakończony', 'COMPLETED', 40, 1, datetime('now'), datetime('now')),
('plfc005', 'Wycena', 'WYCENA', 50, 1, datetime('now'), datetime('now')),
('plfc006', 'Budowa', 'BUDOWA', 60, 1, datetime('now'), datetime('now')),
('plfc007', 'Spawanie', 'SPAWANIE', 70, 1, datetime('now'), datetime('now')),
('plfc008', 'Zakończone', 'ZAKONCZONE', 80, 1, datetime('now'), datetime('now')),
('plfc009', 'Do wyjaśnienia', 'DO_WYJASNIENIA', 90, 1, datetime('now'), datetime('now')),
('plfc010', 'DPW do zrobienia', 'DPW_DO_ZROBIENIA', 100, 1, datetime('now'), datetime('now')),
('plfc011', 'Oczekiwanie na odbiór', 'OCZEKUWANIE_NA_ODBIOR', 110, 1, datetime('now'), datetime('now')),
('plfc012', 'Budowa do zaplanowania', 'BUDOWA_DO_ZAPLANOWANIA', 120, 1, datetime('now'), datetime('now')),
('plfc013', 'Projektowanie', 'PROJEKTOWANIE', 130, 1, datetime('now'), datetime('now'));

-- Seed: rozliczenie (legacy + rozszerzenia)
INSERT INTO "ProjectSettlementStatusOption" ("id", "name", "slug", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
('psett001', 'Brak', 'NONE', 10, 1, datetime('now'), datetime('now')),
('psett002', 'Do rozliczenia', 'TO_SETTLE', 20, 1, datetime('now'), datetime('now')),
('psett003', 'Oczekiwanie na rozliczenie', 'WAITING_FOR_SETTLEMENT', 30, 1, datetime('now'), datetime('now')),
('psett004', 'DPW do zrobienia', 'DPW_TODO', 40, 1, datetime('now'), datetime('now')),
('psett005', 'Rozliczone', 'SETTLED', 50, 1, datetime('now'), datetime('now')),
('psett006', 'Rozliczone — braki', 'SETTLED_WITH_GAPS', 60, 1, datetime('now'), datetime('now')),
('psett007', 'Rozliczone — blokada', 'SETTLED_BLOCKED', 70, 1, datetime('now'), datetime('now')),
('psett008', 'Oczekiwanie na protokół odbioru', 'OCZEKUWANIE_NA_PROTOKOL_ODBIORU', 80, 1, datetime('now'), datetime('now')),
('psett009', 'Oczekiwanie na odbiór', 'OCZEKUWANIE_NA_ODBIOR', 90, 1, datetime('now'), datetime('now')),
('psett010', 'Blokada - usterka', 'BLOKADA_USTERKA', 100, 1, datetime('now'), datetime('now'));

-- Seed: braki
INSERT INTO "ProjectMissingTypeOption" ("id", "name", "slug", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
('pmis001', 'Geodezja', 'GEODEZJA', 10, 1, datetime('now'), datetime('now')),
('pmis002', 'PB / PB + POR', 'PB_PB_POR', 20, 1, datetime('now'), datetime('now')),
('pmis003', 'ZP i UU', 'ZP_I_UU', 30, 1, datetime('now'), datetime('now'));
