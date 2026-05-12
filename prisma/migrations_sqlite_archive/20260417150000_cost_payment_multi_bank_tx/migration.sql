-- Wiele płatności kosztowych może wskazywać tę samą transakcję bankową (częściowe przypisanie kwoty).
DROP INDEX IF EXISTS "CostInvoicePayment_bankTransactionId_key";
