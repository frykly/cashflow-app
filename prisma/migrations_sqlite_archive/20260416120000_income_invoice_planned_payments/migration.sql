-- Plan wpłat (MAIN/VAT) powiązany z fakturą przychodową — osobno od rzeczywistych wpłat.
CREATE TABLE "IncomeInvoicePlannedPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "incomeInvoiceId" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "plannedMainAmount" DECIMAL NOT NULL,
    "plannedVatAmount" DECIMAL NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IncomeInvoicePlannedPayment_incomeInvoiceId_fkey" FOREIGN KEY ("incomeInvoiceId") REFERENCES "IncomeInvoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "IncomeInvoicePlannedPayment_incomeInvoiceId_idx" ON "IncomeInvoicePlannedPayment"("incomeInvoiceId");
