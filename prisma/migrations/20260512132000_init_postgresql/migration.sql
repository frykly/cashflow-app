-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mainOpeningBalance" DECIMAL(65,30) NOT NULL,
    "vatOpeningBalance" DECIMAL(65,30) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCashReconciliation" (
    "id" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "mainBankBalance" DECIMAL(65,30) NOT NULL,
    "vatBankBalance" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "mainChecked" BOOLEAN NOT NULL DEFAULT false,
    "vatChecked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCashReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "clientName" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lifecycleStatus" TEXT,
    "settlementStatus" TEXT,
    "plannedRevenueNet" DECIMAL(65,30),
    "plannedCostNet" DECIMAL(65,30),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "plannedStartDate" TIMESTAMP(3),
    "plannedEndDate" TIMESTAMP(3),
    "assigneeName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "priority" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectLifecycleStatusOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectLifecycleStatusOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectSettlementStatusOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectSettlementStatusOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMissingTypeOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMissingTypeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMissingItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "missingTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMissingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostInvoiceProjectAllocation" (
    "id" TEXT NOT NULL,
    "costInvoiceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "netAmount" DECIMAL(65,30) NOT NULL,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostInvoiceProjectAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeInvoiceProjectAllocation" (
    "id" TEXT NOT NULL,
    "incomeInvoiceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "netAmount" DECIMAL(65,30) NOT NULL,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeInvoiceProjectAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedEventProjectAllocation" (
    "id" TEXT NOT NULL,
    "plannedFinancialEventId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "amountVat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedEventProjectAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,

    CONSTRAINT "IncomeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtherIncome" (
    "id" TEXT NOT NULL,
    "amountGross" DECIMAL(65,30) NOT NULL,
    "vatAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "projectId" TEXT,
    "categoryId" TEXT,
    "source" TEXT NOT NULL,
    "bankTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtherIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "taxId" TEXT,
    "type" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorAlias" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "normalizedAlias" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeInvoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "contractor" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "vatRate" INTEGER NOT NULL DEFAULT 23,
    "netAmount" DECIMAL(65,30) NOT NULL,
    "vatAmount" DECIMAL(65,30) NOT NULL,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "paymentDueDate" TIMESTAMP(3) NOT NULL,
    "plannedIncomeDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "vatDestination" TEXT NOT NULL,
    "confirmedIncome" BOOLEAN NOT NULL DEFAULT false,
    "actualIncomeDate" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "projectName" TEXT,
    "projectId" TEXT,
    "incomeCategoryId" TEXT,
    "sourceRecurringTemplateId" TEXT,
    "generatedOccurrenceDate" TIMESTAMP(3),
    "isGeneratedFromRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isRecurringDetached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeInvoicePlannedPayment" (
    "id" TEXT NOT NULL,
    "incomeInvoiceId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "plannedMainAmount" DECIMAL(65,30) NOT NULL,
    "plannedVatAmount" DECIMAL(65,30) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeInvoicePlannedPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeInvoicePayment" (
    "id" TEXT NOT NULL,
    "incomeInvoiceId" TEXT NOT NULL,
    "amountGross" DECIMAL(65,30) NOT NULL,
    "allocatedMainAmount" DECIMAL(65,30),
    "allocatedVatAmount" DECIMAL(65,30),
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "bankTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeInvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeInvoicePaymentProjectAllocation" (
    "id" TEXT NOT NULL,
    "incomeInvoicePaymentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomeInvoicePaymentProjectAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostInvoice" (
    "id" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "vatRate" INTEGER NOT NULL DEFAULT 23,
    "netAmount" DECIMAL(65,30) NOT NULL,
    "vatAmount" DECIMAL(65,30) NOT NULL,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "paymentDueDate" TIMESTAMP(3) NOT NULL,
    "plannedPaymentDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "actualPaymentDate" TIMESTAMP(3),
    "paymentSource" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "projectName" TEXT,
    "projectId" TEXT,
    "expenseCategoryId" TEXT,
    "sourceRecurringTemplateId" TEXT,
    "generatedOccurrenceDate" TIMESTAMP(3),
    "isGeneratedFromRecurring" BOOLEAN NOT NULL DEFAULT false,
    "isRecurringDetached" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostInvoicePayment" (
    "id" TEXT NOT NULL,
    "costInvoiceId" TEXT NOT NULL,
    "amountGross" DECIMAL(65,30) NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "bankTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostInvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostInvoicePaymentProjectAllocation" (
    "id" TEXT NOT NULL,
    "costInvoicePaymentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostInvoicePaymentProjectAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountMode" TEXT NOT NULL DEFAULT 'MAIN',
    "amount" DECIMAL(65,30) NOT NULL,
    "amountVat" DECIMAL(65,30),
    "incomeCategoryId" TEXT,
    "expenseCategoryId" TEXT,
    "frequency" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "dayOfMonth" INTEGER,
    "weekday" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedFinancialEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(65,30) NOT NULL,
    "amountVat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "plannedDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "projectName" TEXT,
    "projectId" TEXT,
    "incomeCategoryId" TEXT,
    "expenseCategoryId" TEXT,
    "convertedToIncomeInvoiceId" TEXT,
    "convertedToCostInvoiceId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlannedFinancialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "skippedLinesJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "bookingDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "counterpartyName" TEXT,
    "counterpartyAccount" TEXT,
    "accountType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedInvoiceId" TEXT,
    "linkedCostInvoiceId" TEXT,
    "createdCostId" TEXT,
    "dedupeKey" TEXT,
    "dedupeInputText" TEXT,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KsefSyncSession" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'test',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KsefSyncSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KsefDocument" (
    "id" TEXT NOT NULL,
    "ksefId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "saleDate" TIMESTAMP(3),
    "sellerName" TEXT NOT NULL,
    "sellerTaxId" TEXT NOT NULL DEFAULT '',
    "buyerName" TEXT NOT NULL,
    "buyerTaxId" TEXT NOT NULL DEFAULT '',
    "netAmount" DECIMAL(65,30) NOT NULL,
    "vatAmount" DECIMAL(65,30) NOT NULL,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "rawPayload" TEXT NOT NULL,
    "importedAsCostInvoiceId" TEXT,
    "importedAsRevenueInvoiceId" TEXT,
    "syncSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KsefDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCashReconciliation_dayKey_key" ON "DailyCashReconciliation"("dayKey");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_idx" ON "ProjectTask"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectLifecycleStatusOption_slug_key" ON "ProjectLifecycleStatusOption"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectSettlementStatusOption_slug_key" ON "ProjectSettlementStatusOption"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMissingTypeOption_slug_key" ON "ProjectMissingTypeOption"("slug");

-- CreateIndex
CREATE INDEX "ProjectMissingItem_projectId_idx" ON "ProjectMissingItem"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMissingItem_missingTypeId_idx" ON "ProjectMissingItem"("missingTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMissingItem_projectId_missingTypeId_key" ON "ProjectMissingItem"("projectId", "missingTypeId");

-- CreateIndex
CREATE INDEX "CostInvoiceProjectAllocation_costInvoiceId_idx" ON "CostInvoiceProjectAllocation"("costInvoiceId");

-- CreateIndex
CREATE INDEX "CostInvoiceProjectAllocation_projectId_idx" ON "CostInvoiceProjectAllocation"("projectId");

-- CreateIndex
CREATE INDEX "IncomeInvoiceProjectAllocation_incomeInvoiceId_idx" ON "IncomeInvoiceProjectAllocation"("incomeInvoiceId");

-- CreateIndex
CREATE INDEX "IncomeInvoiceProjectAllocation_projectId_idx" ON "IncomeInvoiceProjectAllocation"("projectId");

-- CreateIndex
CREATE INDEX "PlannedEventProjectAllocation_plannedFinancialEventId_idx" ON "PlannedEventProjectAllocation"("plannedFinancialEventId");

-- CreateIndex
CREATE INDEX "PlannedEventProjectAllocation_projectId_idx" ON "PlannedEventProjectAllocation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "IncomeCategory_slug_key" ON "IncomeCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OtherIncome_bankTransactionId_key" ON "OtherIncome"("bankTransactionId");

-- CreateIndex
CREATE INDEX "OtherIncome_date_idx" ON "OtherIncome"("date");

-- CreateIndex
CREATE INDEX "OtherIncome_projectId_idx" ON "OtherIncome"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_slug_key" ON "ExpenseCategory"("slug");

-- CreateIndex
CREATE INDEX "Contractor_normalizedName_idx" ON "Contractor"("normalizedName");

-- CreateIndex
CREATE INDEX "Contractor_taxId_idx" ON "Contractor"("taxId");

-- CreateIndex
CREATE INDEX "ContractorAlias_contractorId_idx" ON "ContractorAlias"("contractorId");

-- CreateIndex
CREATE INDEX "ContractorAlias_normalizedAlias_idx" ON "ContractorAlias"("normalizedAlias");

-- CreateIndex
CREATE INDEX "IncomeInvoice_sourceRecurringTemplateId_idx" ON "IncomeInvoice"("sourceRecurringTemplateId");

-- CreateIndex
CREATE INDEX "IncomeInvoice_generatedOccurrenceDate_idx" ON "IncomeInvoice"("generatedOccurrenceDate");

-- CreateIndex
CREATE INDEX "IncomeInvoice_projectId_idx" ON "IncomeInvoice"("projectId");

-- CreateIndex
CREATE INDEX "IncomeInvoicePlannedPayment_incomeInvoiceId_idx" ON "IncomeInvoicePlannedPayment"("incomeInvoiceId");

-- CreateIndex
CREATE INDEX "IncomeInvoicePayment_bankTransactionId_idx" ON "IncomeInvoicePayment"("bankTransactionId");

-- CreateIndex
CREATE INDEX "IncomeInvoicePaymentProjectAllocation_incomeInvoicePaymentI_idx" ON "IncomeInvoicePaymentProjectAllocation"("incomeInvoicePaymentId");

-- CreateIndex
CREATE INDEX "IncomeInvoicePaymentProjectAllocation_projectId_idx" ON "IncomeInvoicePaymentProjectAllocation"("projectId");

-- CreateIndex
CREATE INDEX "CostInvoice_sourceRecurringTemplateId_idx" ON "CostInvoice"("sourceRecurringTemplateId");

-- CreateIndex
CREATE INDEX "CostInvoice_generatedOccurrenceDate_idx" ON "CostInvoice"("generatedOccurrenceDate");

-- CreateIndex
CREATE INDEX "CostInvoice_projectId_idx" ON "CostInvoice"("projectId");

-- CreateIndex
CREATE INDEX "CostInvoicePayment_bankTransactionId_idx" ON "CostInvoicePayment"("bankTransactionId");

-- CreateIndex
CREATE INDEX "CostInvoicePaymentProjectAllocation_costInvoicePaymentId_idx" ON "CostInvoicePaymentProjectAllocation"("costInvoicePaymentId");

-- CreateIndex
CREATE INDEX "CostInvoicePaymentProjectAllocation_projectId_idx" ON "CostInvoicePaymentProjectAllocation"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedFinancialEvent_convertedToIncomeInvoiceId_key" ON "PlannedFinancialEvent"("convertedToIncomeInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedFinancialEvent_convertedToCostInvoiceId_key" ON "PlannedFinancialEvent"("convertedToCostInvoiceId");

-- CreateIndex
CREATE INDEX "PlannedFinancialEvent_projectId_idx" ON "PlannedFinancialEvent"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_dedupeKey_key" ON "BankTransaction"("dedupeKey");

-- CreateIndex
CREATE INDEX "BankTransaction_importId_idx" ON "BankTransaction"("importId");

-- CreateIndex
CREATE INDEX "BankTransaction_status_idx" ON "BankTransaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "KsefDocument_ksefId_key" ON "KsefDocument"("ksefId");

-- CreateIndex
CREATE INDEX "KsefDocument_syncSessionId_idx" ON "KsefDocument"("syncSessionId");

-- CreateIndex
CREATE INDEX "KsefDocument_issueDate_idx" ON "KsefDocument"("issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMissingItem" ADD CONSTRAINT "ProjectMissingItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMissingItem" ADD CONSTRAINT "ProjectMissingItem_missingTypeId_fkey" FOREIGN KEY ("missingTypeId") REFERENCES "ProjectMissingTypeOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostInvoiceProjectAllocation" ADD CONSTRAINT "CostInvoiceProjectAllocation_costInvoiceId_fkey" FOREIGN KEY ("costInvoiceId") REFERENCES "CostInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostInvoiceProjectAllocation" ADD CONSTRAINT "CostInvoiceProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeInvoiceProjectAllocation" ADD CONSTRAINT "IncomeInvoiceProjectAllocation_incomeInvoiceId_fkey" FOREIGN KEY ("incomeInvoiceId") REFERENCES "IncomeInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeInvoiceProjectAllocation" ADD CONSTRAINT "IncomeInvoiceProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedEventProjectAllocation" ADD CONSTRAINT "PlannedEventProjectAllocation_plannedFinancialEventId_fkey" FOREIGN KEY ("plannedFinancialEventId") REFERENCES "PlannedFinancialEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedEventProjectAllocation" ADD CONSTRAINT "PlannedEventProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherIncome" ADD CONSTRAINT "OtherIncome_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherIncome" ADD CONSTRAINT "OtherIncome_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "IncomeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtherIncome" ADD CONSTRAINT "OtherIncome_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorAlias" ADD CONSTRAINT "ContractorAlias_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeInvoice" ADD CONSTRAINT "IncomeInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeInvoice" ADD CONSTRAINT "IncomeInvoice_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeInvoice" ADD CONSTRAINT "IncomeInvoice_sourceRecurringTemplateId_fkey" FOREIGN KEY ("sourceRecurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeInvoicePlannedPayment" ADD CONSTRAINT "IncomeInvoicePlannedPayment_incomeInvoiceId_fkey" FOREIGN KEY ("incomeInvoiceId") REFERENCES "IncomeInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeInvoicePayment" ADD CONSTRAINT "IncomeInvoicePayment_incomeInvoiceId_fkey" FOREIGN KEY ("incomeInvoiceId") REFERENCES "IncomeInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeInvoicePaymentProjectAllocation" ADD CONSTRAINT "IncomeInvoicePaymentProjectAllocation_incomeInvoicePayment_fkey" FOREIGN KEY ("incomeInvoicePaymentId") REFERENCES "IncomeInvoicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeInvoicePaymentProjectAllocation" ADD CONSTRAINT "IncomeInvoicePaymentProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostInvoice" ADD CONSTRAINT "CostInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostInvoice" ADD CONSTRAINT "CostInvoice_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostInvoice" ADD CONSTRAINT "CostInvoice_sourceRecurringTemplateId_fkey" FOREIGN KEY ("sourceRecurringTemplateId") REFERENCES "RecurringTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostInvoicePayment" ADD CONSTRAINT "CostInvoicePayment_costInvoiceId_fkey" FOREIGN KEY ("costInvoiceId") REFERENCES "CostInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostInvoicePaymentProjectAllocation" ADD CONSTRAINT "CostInvoicePaymentProjectAllocation_costInvoicePaymentId_fkey" FOREIGN KEY ("costInvoicePaymentId") REFERENCES "CostInvoicePayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostInvoicePaymentProjectAllocation" ADD CONSTRAINT "CostInvoicePaymentProjectAllocation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTemplate" ADD CONSTRAINT "RecurringTemplate_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedFinancialEvent" ADD CONSTRAINT "PlannedFinancialEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedFinancialEvent" ADD CONSTRAINT "PlannedFinancialEvent_incomeCategoryId_fkey" FOREIGN KEY ("incomeCategoryId") REFERENCES "IncomeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedFinancialEvent" ADD CONSTRAINT "PlannedFinancialEvent_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedFinancialEvent" ADD CONSTRAINT "PlannedFinancialEvent_convertedToIncomeInvoiceId_fkey" FOREIGN KEY ("convertedToIncomeInvoiceId") REFERENCES "IncomeInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedFinancialEvent" ADD CONSTRAINT "PlannedFinancialEvent_convertedToCostInvoiceId_fkey" FOREIGN KEY ("convertedToCostInvoiceId") REFERENCES "CostInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "BankImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KsefDocument" ADD CONSTRAINT "KsefDocument_syncSessionId_fkey" FOREIGN KEY ("syncSessionId") REFERENCES "KsefSyncSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
