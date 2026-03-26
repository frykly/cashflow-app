import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

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

const dbPath = sqliteFilePath(readDatabaseUrl());
const backupsDir = join(root, "backups");

if (!existsSync(dbPath)) {
  console.error(`Brak pliku bazy: ${dbPath}`);
  console.error("Utwórz bazę: npm run db:migrate");
  process.exit(1);
}

mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dest = join(backupsDir, `cashflow-${stamp}.db`);
copyFileSync(dbPath, dest);
console.log(`Backup zapisany: ${dest}`);
