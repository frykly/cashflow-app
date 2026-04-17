-- Opcjonalny ręczny podział wpłaty przychodu na salda MAIN / VAT (cashflow).
-- NULL = dotychczasowa logika proporcjonalna z faktury.
ALTER TABLE "IncomeInvoicePayment" ADD COLUMN "allocatedMainAmount" REAL;
ALTER TABLE "IncomeInvoicePayment" ADD COLUMN "allocatedVatAmount" REAL;
