/**
 * Po edycji już zastosowanej migracji Prisma wykrywa rozjazd checksum i żąda resetu bazy.
 * Ten skrypt ustawia w _prisma_migrations checksum zgodny z bieżącą treścią pliku migration.sql
 * (Prisma używa SHA-256 hex całej zawartości pliku).
 *
 * Użycie:
 *   node scripts/repair-migration-checksum.mjs
 *   node scripts/repair-migration-checksum.mjs 20260326153000_recurring_generated_invoices
 */
import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const prismaDir = join(root, "prisma");

function readDatabaseUrl() {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) return fromEnv;
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    return "file:../data/cashflow.db";
  }
  const text = readFileSync(envPath, "utf8");
  const m = text.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?/m);
  return m?.[1]?.trim() ?? "file:../data/cashflow.db";
}

function sqliteFilePath(databaseUrl) {
  let raw = databaseUrl.replace(/^file:/i, "").trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  return resolve(prismaDir, raw);
}

const migrationName = process.argv[2] ?? "20260326153000_recurring_generated_invoices";
const sqlPath = join(prismaDir, "migrations", migrationName, "migration.sql");

if (!existsSync(sqlPath)) {
  console.error(`Brak pliku migracji: ${sqlPath}`);
  process.exit(1);
}

const body = readFileSync(sqlPath);
const checksum = createHash("sha256").update(body).digest("hex");
const dbPath = sqliteFilePath(readDatabaseUrl());

if (!existsSync(dbPath)) {
  console.error(`Brak pliku bazy: ${dbPath}`);
  process.exit(1);
}

const sql = `UPDATE _prisma_migrations SET checksum = '${checksum}' WHERE migration_name = '${migrationName}';`;

try {
  execFileSync("sqlite3", [dbPath, sql], { stdio: "inherit" });
} catch {
  console.error("Nie udało się uruchomić sqlite3. Zainstaluj CLI SQLite lub wykonaj ręcznie:");
  console.error(sql);
  process.exit(1);
}

console.log(`OK: ${migrationName}`);
console.log(`checksum = ${checksum}`);
console.log(`baza: ${dbPath}`);
