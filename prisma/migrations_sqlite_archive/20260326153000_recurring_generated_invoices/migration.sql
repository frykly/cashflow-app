-- Recurring → normalne koszty / przychody: migracja starych planów z recurringTemplateId
-- (Kolumny sourceRecurringTemplateId / generatedOccurrenceDate / isGeneratedFromRecurring / isRecurringDetached
--  są już w schemacie po migracji 20260326091725_backup_zmiany_cykliczne — bez ponownego ALTER.)

-- Planowane wpisy powiązane z regułą → CostInvoice (EXPENSE)
INSERT INTO "CostInvoice" (
    "id",
    "documentNumber",
    "supplier",
    "description",
    "vatRate",
    "netAmount",
    "vatAmount",
    "grossAmount",
    "documentDate",
    "paymentDueDate",
    "plannedPaymentDate",
    "status",
    "paid",
    "actualPaymentDate",
    "paymentSource",
    "notes",
    "expenseCategoryId",
    "createdAt",
    "updatedAt",
    "sourceRecurringTemplateId",
    "generatedOccurrenceDate",
    "isGeneratedFromRecurring",
    "isRecurringDetached"
)
SELECT
    p."id",
    'CYK-' || substr(replace(p."id", '-', ''), 1, 14),
    CASE WHEN trim(p."title") = '' THEN 'Cykliczne' ELSE p."title" END,
    COALESCE(p."description", ''),
    CASE
        WHEN (ABS(CAST(p."amount" AS REAL)) > 0.00001) AND (ABS(CAST(COALESCE(p."amountVat", 0) AS REAL)) > 0.00001) THEN 23
        WHEN ABS(CAST(COALESCE(p."amountVat", 0) AS REAL)) > 0.00001 THEN 23
        ELSE 0
    END,
    p."amount",
    COALESCE(p."amountVat", 0),
    (CAST(p."amount" AS REAL) + CAST(COALESCE(p."amountVat", 0) AS REAL)),
    p."plannedDate",
    p."plannedDate",
    p."plannedDate",
    CASE WHEN p."status" = 'DONE' THEN 'ZAPLACONA' ELSE 'PLANOWANA' END,
    CASE WHEN p."status" = 'DONE' THEN 1 ELSE 0 END,
    CASE WHEN p."status" = 'DONE' THEN p."plannedDate" ELSE NULL END,
    CASE
        WHEN (ABS(CAST(p."amount" AS REAL)) > 0.00001) AND (ABS(CAST(COALESCE(p."amountVat", 0) AS REAL)) > 0.00001) THEN 'VAT_THEN_MAIN'
        WHEN ABS(CAST(COALESCE(p."amountVat", 0) AS REAL)) > 0.00001 THEN 'VAT'
        ELSE 'MAIN'
    END,
    CASE
        WHEN trim(COALESCE(p."notes", '')) = '' THEN 'Migrowane z planu (cykliczne).'
        ELSE p."notes" || ' | Migrowane z planu (cykliczne).'
    END,
    p."expenseCategoryId",
    p."createdAt",
    p."updatedAt",
    p."recurringTemplateId",
    p."plannedDate",
    1,
    0
FROM "PlannedFinancialEvent" AS p
WHERE p."recurringTemplateId" IS NOT NULL
  AND p."type" = 'EXPENSE';

-- Planowane wpisy powiązane z regułą → IncomeInvoice (INCOME)
INSERT INTO "IncomeInvoice" (
    "id",
    "invoiceNumber",
    "contractor",
    "description",
    "vatRate",
    "netAmount",
    "vatAmount",
    "grossAmount",
    "issueDate",
    "paymentDueDate",
    "plannedIncomeDate",
    "status",
    "vatDestination",
    "confirmedIncome",
    "actualIncomeDate",
    "notes",
    "incomeCategoryId",
    "createdAt",
    "updatedAt",
    "sourceRecurringTemplateId",
    "generatedOccurrenceDate",
    "isGeneratedFromRecurring",
    "isRecurringDetached"
)
SELECT
    p."id",
    'CYK-' || substr(replace(p."id", '-', ''), 1, 14),
    CASE WHEN trim(p."title") = '' THEN 'Cykliczne' ELSE p."title" END,
    COALESCE(p."description", ''),
    CASE
        WHEN (ABS(CAST(p."amount" AS REAL)) > 0.00001) AND (ABS(CAST(COALESCE(p."amountVat", 0) AS REAL)) > 0.00001) THEN 23
        WHEN ABS(CAST(COALESCE(p."amountVat", 0) AS REAL)) > 0.00001 THEN 23
        ELSE 0
    END,
    p."amount",
    COALESCE(p."amountVat", 0),
    (CAST(p."amount" AS REAL) + CAST(COALESCE(p."amountVat", 0) AS REAL)),
    p."plannedDate",
    p."plannedDate",
    p."plannedDate",
    CASE WHEN p."status" = 'DONE' THEN 'OPLACONA' ELSE 'PLANOWANA' END,
    CASE
        WHEN (ABS(CAST(p."amount" AS REAL)) > 0.00001) AND (ABS(CAST(COALESCE(p."amountVat", 0) AS REAL)) > 0.00001) THEN 'VAT'
        WHEN ABS(CAST(COALESCE(p."amountVat", 0) AS REAL)) > 0.00001 THEN 'VAT'
        ELSE 'MAIN'
    END,
    0,
    CASE WHEN p."status" = 'DONE' THEN p."plannedDate" ELSE NULL END,
    CASE
        WHEN trim(COALESCE(p."notes", '')) = '' THEN 'Migrowane z planu (cykliczne).'
        ELSE p."notes" || ' | Migrowane z planu (cykliczne).'
    END,
    p."incomeCategoryId",
    p."createdAt",
    p."updatedAt",
    p."recurringTemplateId",
    p."plannedDate",
    1,
    0
FROM "PlannedFinancialEvent" AS p
WHERE p."recurringTemplateId" IS NOT NULL
  AND p."type" = 'INCOME';

DELETE FROM "PlannedFinancialEvent" WHERE "recurringTemplateId" IS NOT NULL;

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_PlannedFinancialEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL NOT NULL,
    "amountVat" DECIMAL NOT NULL DEFAULT 0,
    "plannedDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "incomeCategoryId" TEXT,
    "expenseCategoryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedFinancialEvent_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PlannedFinancialEvent_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_PlannedFinancialEvent" (
    "id",
    "type",
    "title",
    "description",
    "amount",
    "amountVat",
    "plannedDate",
    "status",
    "notes",
    "incomeCategoryId",
    "expenseCategoryId",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "type",
    "title",
    "description",
    "amount",
    "amountVat",
    "plannedDate",
    "status",
    "notes",
    "incomeCategoryId",
    "expenseCategoryId",
    "createdAt",
    "updatedAt"
FROM "PlannedFinancialEvent";

DROP TABLE "PlannedFinancialEvent";
ALTER TABLE "new_PlannedFinancialEvent" RENAME TO "PlannedFinancialEvent";

-- Indeksy na fakturach utworzone już w 20260326091725_backup_zmiany_cykliczne

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
