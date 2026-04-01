-- AlterTable
ALTER TABLE "IncomeInvoicePayment" ADD COLUMN "bankTransactionId" TEXT;

-- AlterTable
ALTER TABLE "CostInvoicePayment" ADD COLUMN "bankTransactionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IncomeInvoicePayment_bankTransactionId_key" ON "IncomeInvoicePayment"("bankTransactionId");

-- CreateIndex
CREATE INDEX "IncomeInvoicePayment_bankTransactionId_idx" ON "IncomeInvoicePayment"("bankTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CostInvoicePayment_bankTransactionId_key" ON "CostInvoicePayment"("bankTransactionId");

-- CreateIndex
CREATE INDEX "CostInvoicePayment_bankTransactionId_idx" ON "CostInvoicePayment"("bankTransactionId");
