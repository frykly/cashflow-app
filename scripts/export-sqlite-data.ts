/**
 * Eksport danych z SQLite do JSON (Krok 0, read-only).
 * Nie zmienia schema.prisma — używa Prisma Client + raw SQL SELECT *.
 *
 * Uruchom: npm run export:sqlite-data
 * Wynik: exports/sqlite-export-<timestamp>/*.json + manifest.json
 */

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

function loadDotEnvFile(): void {
  const p = resolve(process.cwd(), ".env");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnvFile();

const prisma = new PrismaClient();

async function tableNames(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  );
  return rows.map((r) => r.name).filter((n) => n !== "_prisma_migrations");
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19).replace("T", "_");
  const outDir = resolve(process.cwd(), "exports", `sqlite-export-${stamp}`);
  mkdirSync(outDir, { recursive: true });

  const tables = await tableNames();
  const manifest: Record<string, { rows: number; file: string }> = {};

  for (const t of tables) {
    const file = `${t}.json`;
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${t}"`);
    writeFileSync(resolve(outDir, file), JSON.stringify(rows, null, 0), "utf8");
    manifest[t] = { rows: rows.length, file };
  }

  writeFileSync(
    resolve(outDir, "manifest.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), tables: manifest }, null, 2),
    "utf8",
  );

  console.log(`Eksport zapisano w: ${outDir}`);
  console.log(`Tabel: ${tables.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
