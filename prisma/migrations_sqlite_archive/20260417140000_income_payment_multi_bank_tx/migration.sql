-- Wiele wpłat przychodu może wskazywać tę samą transakcję bankową (częściowe przypisanie kwoty).
DROP INDEX IF EXISTS "IncomeInvoicePayment_bankTransactionId_key";
