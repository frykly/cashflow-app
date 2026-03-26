# Cashflow MVP

Aplikacja Next.js (App Router) z API, Prisma i SQLite do prognozy cashflow, faktur i planów.

## Uruchomienie

```bash
npm install
npm run db:migrate
npm run dev
```

Otwórz [http://localhost:3000](http://localhost:3000).

## Dane i baza SQLite

### Gdzie są przechowywane dane

- **`DATABASE_URL`** w pliku `.env` (skopiuj z `.env.example`).
- Domyślnie: `file:../data/cashflow.db` — ścieżka jest **względna do katalogu `prisma/`** (jak w dokumentacji Prisma).
- Fizyczny plik bazy: **`data/cashflow.db`** w katalogu głównym projektu (obok `package.json`).
- Katalog `data/` jest w repozytorium (`.gitkeep`); sam plik **`cashflow.db` jest w `.gitignore`**, żeby nie commitować lokalnych danych.

### Czy dane przetrwają restart

- **Tak** — Next.js (`npm run dev` / `npm run start`) **nie** tworzy ani nie czyści bazy przy starcie.
- Dane znikają tylko wtedy, gdy **usuniesz plik** `data/cashflow.db`, uruchomisz **`prisma migrate reset`**, lub **świadomie** uruchomisz seed z **`--force`** (patrz niżej).

### Seed i migracje

- **`npm run db:seed`** — uruchamia **tylko na żądanie** (`prisma/seed.ts`). Nigdy przy `next dev` ani `postinstall` (`postinstall` to tylko `prisma generate`).
- W `package.json` **nie** ma już wpisu `prisma.seed`, który powodowałby automatyczne odpalanie seeda przez niektóre polecenia Prisma (np. po migracji).

#### Bezpieczny seed (domyślnie)

- **`npm run db:seed`** **bez** `--force`:
  - Jeśli w bazie **są już jakiekolwiek dane** (ustawienia, faktury, kategorie, plany, szablony itd.) — skrypt **nic nie usuwa**, kończy z komunikatem i **zostawia Twoje dane**.
  - Jeśli baza jest **pusta** (np. świeżo po migracji) — wgrywa **dane demo** (tak jak wcześniej pierwszy seed).

#### Tryb `--force` (usuwa dane, potem demo)

- **`npm run db:seed -- --force`** — **czyści** istniejące rekordy w zakresie seeda i **wstawia od nowa** dane demonstracyjne. Używaj tylko świadomie.

#### Jak bezpiecznie załadować demo na „pełnej” bazie

1. Zrób kopię: `npm run db:backup`
2. `npm run db:seed -- --force`

- **`prisma migrate reset`** nadal usuwa bazę i stosuje migracje od zera — używaj tylko świadomie.

### Backup

```bash
npm run db:backup
```

Tworzy katalog `backups/` (jeśli nie ma) i kopiuje aktualny plik SQLite do pliku z timestampem, np. `backups/cashflow-2026-03-25T12-14-21.db`.

### Przywracanie z kopii

1. Zatrzymaj serwer (`npm run dev` / `npm run start`).
2. Nadpisz plik bazy:

```bash
cp backups/cashflow-2026-03-25T12-14-21.db data/cashflow.db
```

3. Uruchom ponownie aplikację.

### Migracja ze starej lokalizacji (`prisma/dev.db`)

Jeśli wcześniej używałeś `DATABASE_URL="file:./dev.db"`, baza leżała w `prisma/dev.db`. Po zmianie URL na `file:../data/cashflow.db` **przenieś** dane:

```bash
mkdir -p data
cp prisma/dev.db data/cashflow.db
```

Stary plik `prisma/dev.db` możesz usunąć, żeby nie mieć dwóch kopii.

---

## Learn More (Next.js)

- [Next.js Documentation](https://nextjs.org/docs) — aplikacja oparta na `create-next-app`.
