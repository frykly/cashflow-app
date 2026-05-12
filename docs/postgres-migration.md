# Migracja SQLite → PostgreSQL (Supabase) — dokumentacja

Ten dokument opisuje **Etap A** przygotowania i migracji. Obecny **Krok 0** nie zmienia `schema.prisma`, migracji ani `DATABASE_URL`.

## Dlaczego stare migracje SQLite nie działają na Postgres

- Pliki `prisma/migrations/*/migration.sql` są w **dialekcie SQLite** (`AUTOINCREMENT`, `DATETIME`, `TEXT`, sposób obsługi `BOOLEAN` itd.).
- `prisma/migrate deploy` na Postgres **wykonuje te pliki dosłownie** — Postgres ich nie zaakceptuje.
- `migration_lock.toml` jest powiązany z providerem `sqlite`.

**Wniosek:** na Postgres potrzebny jest **nowy, pojedynczy init** (lub baseline) wygenerowany z **aktualnego** `schema.prisma` z `provider = "postgresql"`, **bez** odtwarzania historii SQLite 1:1.

## Plan nowej migracji init PostgreSQL (po gałęzi `postgres-migration`)

1. Osobna gałąź git (np. `postgres-migration`).
2. Zmiana w `schema.prisma`: `provider = "postgresql"`, `url = env("DATABASE_URL")`, opcjonalnie `directUrl = env("DIRECT_URL")`.
3. Uporządkowanie folderu migracji (decyzja zespołu):
   - archiwum starych SQL w podfolderze **tylko do historii**, **albo**
   - jeden nowy katalog `prisma/migrations/<timestamp>_init_postgresql/migration.sql` z pełnym schematem (np. `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` — wersja CLI zgodna z projektem).
4. `migration_lock.toml` → `provider = "postgresql"`.
5. Na pustej bazie Postgres: `npx prisma migrate deploy` (lub procedura `db push` + `migrate resolve` — do ustalenia przy wdrożeniu).

**Nie uruchamiaj** tych komend na produkcji bez wcześniejszej walidacji na klonie bazy.

## DATABASE_URL / DIRECT_URL (Supabase)

- **`DATABASE_URL`** — zwykle connection string **poolera** (Supabase: **Transaction pooler**, często port **6543**), z parametrami zalecanymi przez [dokumentację Prisma + Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler).
- **`DIRECT_URL`** — połączenie **bez poolera** (port **5432**, „Direct”), używane przez `prisma migrate deploy` / narzędzia migracji, aby uniknąć problemów PgBouncer z wieloma instrukcjami w jednej migracji.

Przykładowe zmienne (tylko szkic — wartości z panelu Supabase):

```bash
# Pooler (aplikacja Next.js)
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres?pgbouncer=true&connection_limit=1"

# Direct (migracje)
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/postgres"
```

**Supabase Auth** — w tym etapie **nie** używamy; tylko silnik Postgres.

## Plan importu danych

1. **Klon / środowisko testowe** Postgres (nie produkcja przy pierwszym imporcie).
2. Po utworzeniu struktury (migracja init): skrypt importu (np. z JSON wygenerowanego przez `scripts/export-sqlite-data.ts` lub dedykowany importer z kolejnością FK).
3. **Kolejność tabel** — wg zależności FK (patrz sekcja poniżej): najpierw encje bez obcych kluczy lub tylko opcjonalne, potem zależne.
4. **Walidacja** — `scripts/audit-sqlite-for-postgres.ts` na SQLite **przed** migracją; po imporcie powtórzyć **count/sum** na Postgres (osobny skrypt lub ręczne SQL).

## Plan walidacji (count / sum)

| Kontrola | SQLite (przed) | Postgres (po) |
|----------|------------------|---------------|
| Liczba wierszy | `audit:sqlite` | `SELECT COUNT(*)` per tabela |
| IncomeInvoice | `SUM(netAmount)`, `SUM(vatAmount)`, `SUM(grossAmount)` | to samo |
| CostInvoice | j.w. | j.w. |
| BankTransaction | `SUM(amount)` (grosze) | `SUM(amount)` |
| ProjectTask, User | `COUNT(*)` | j.w. |

Dodatkowo: kilka losowych ID, porównanie `DateTime`, smoke test UI (logowanie, lista faktur, zadania).

## Rollback do SQLite

1. Przywróć `DATABASE_URL="file:../data/cashflow.db"` (lub backup z `~/Desktop/cashflow-backups/`).
2. Kod musi wskazywać `provider = "sqlite"` i spójny zestaw migracji (commit sprzed przełączenia Postgres).
3. `npx prisma generate`, `npm run dev`.

## Lista tabel i zależności FK (kolejność referencyjna do importu)

Kolejność **względna** (wcześniej = brak zależności lub tylko w grupie):

1. **AppSettings** — brak FK  
2. **DailyCashReconciliation** — brak FK  
3. **ProjectLifecycleStatusOption**, **ProjectSettlementStatusOption**, **ProjectMissingTypeOption** — brak FK  
4. **IncomeCategory**, **ExpenseCategory** — brak FK  
5. **User** — brak FK  
6. **Contractor** → **ContractorAlias** (`contractorId`)  
7. **Project** — brak FK do innych encji biznesowych (statusy to stringi)  
8. **ProjectTask** (`projectId`), **ProjectMissingItem** (`projectId`, `missingTypeId`)  
9. **RecurringTemplate** (`incomeCategoryId?`, `expenseCategoryId?`)  
10. **BankImport** → **BankTransaction** (`importId`)  
11. **IncomeInvoice** (`projectId?`, `incomeCategoryId?`, `sourceRecurringTemplateId?`)  
12. **IncomeInvoicePlannedPayment**, **IncomeInvoicePayment** (`incomeInvoiceId`, opcj. `bankTransactionId`)  
13. **IncomeInvoicePaymentProjectAllocation** (`incomeInvoicePaymentId`, `projectId`)  
14. **IncomeInvoiceProjectAllocation** (`incomeInvoiceId`, `projectId`)  
5. **CostInvoice** (`projectId?`, `expenseCategoryId?`, `sourceRecurringTemplateId?`)  
16. **CostInvoicePayment** (`costInvoiceId`, opcj. `bankTransactionId`)  
17. **CostInvoicePaymentProjectAllocation** (`costInvoicePaymentId`, `projectId`)  
18. **CostInvoiceProjectAllocation** (`costInvoiceId`, `projectId`)  
19. **PlannedFinancialEvent** (`projectId?`, kategorie?, `convertedToIncomeInvoiceId?`, `convertedToCostInvoiceId?`) — *uwaga: cykliczne powiązania z fakturami; import często po fakturach lub z wyłączeniem FK na czas sesji*  
20. **PlannedEventProjectAllocation** (`plannedFinancialEventId`, `projectId`)  
21. **OtherIncome** (`projectId?`, `categoryId?`, `bankTransactionId?`)  
22. **KsefSyncSession** → **KsefDocument** (`syncSessionId?`)

Szczegóły cykli **PlannedFinancialEvent ↔ IncomeInvoice/CostInvoice** wymagają doprecyzowania w skrypcie importu (kolejność lub tymczasowe `NULL` + aktualizacja).

## Komendy (referencja — nie na produkcję bez akceptacji)

```bash
# Krok 0 — audyt SQLite (lokalnie)
npm run audit:sqlite

# Opcjonalnie — eksport JSON (lokalnie)
npm run export:sqlite-data

# Po przełączeniu na Postgres (na odpowiedniej gałęzi, po akceptacji)
# rm -rf .next
# npx prisma generate
# npx prisma migrate deploy   # lub uzgodniona procedura baseline
# npm run build
# npm run dev
```

## Powiązane skrypty

| Plik | Opis |
|------|------|
| `scripts/audit-sqlite-for-postgres.ts` | Liczności, sumy, zakresy dat, FK orphans, AppSettings/User |
| `scripts/export-sqlite-data.ts` | Eksport tabel SQLite → JSON (read-only, bez zmiany schema) |

## Auth po migracji

- Bez zmian: `User`, `passwordHash`, JWT cookie, `AUTH_SECRET`.
- Jeśli tabela `User` jest pusta na nowej bazie: `npm run create-admin` z `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
