/**
 * Walidacja bazy PostgreSQL po imporcie (count / sum / orphan FK jak audit SQLite).
 * Wymaga DATABASE_URL / DIRECT_URL dla Postgres.
 *
 * Uruchom: npm run validate:postgres-after-import
 * Wynik: reports/postgres-validation-<timestamp>.{json,txt}
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
    if (process.env[key] === undefined) (process.env as Record<string, string>)[key] = val;
  }
}

loadDotEnvFile();

function replacerJson(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  return value;
}

const prisma = new PrismaClient();

type OrphanCheck = { label: string; count: number };

async function tableNames(): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<{ table_name: string }[]>(`
    SELECT table_name as "table_name"
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name
  `);
  return rows.map((r) => r.table_name);
}

async function tableCount(name: string): Promise<number> {
  const q = `SELECT COUNT(*)::bigint as c FROM "${name}"`;
  const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(q);
  const c = rows[0]?.c;
  return typeof c === "bigint" ? Number(c) : Number(c ?? 0);
}

async function runOrphanChecks(): Promise<OrphanCheck[]> {
  const checks: Array<{ label: string; sql: string }> = [
    {
      label: "ProjectTask bez Project",
      sql: `SELECT COUNT(*)::bigint as c FROM "ProjectTask" pt LEFT JOIN "Project" p ON p.id = pt."projectId" WHERE p.id IS NULL`,
    },
    {
      label: "ProjectMissingItem bez Project",
      sql: `SELECT COUNT(*)::bigint as c FROM "ProjectMissingItem" m LEFT JOIN "Project" p ON p.id = m."projectId" WHERE p.id IS NULL`,
    },
    {
      label: "ProjectMissingItem bez ProjectMissingTypeOption",
      sql: `SELECT COUNT(*)::bigint as c FROM "ProjectMissingItem" m LEFT JOIN "ProjectMissingTypeOption" t ON t.id = m."missingTypeId" WHERE t.id IS NULL`,
    },
    {
      label: "ContractorAlias bez Contractor",
      sql: `SELECT COUNT(*)::bigint as c FROM "ContractorAlias" a LEFT JOIN "Contractor" c ON c.id = a."contractorId" WHERE c.id IS NULL`,
    },
    {
      label: "BankTransaction bez BankImport",
      sql: `SELECT COUNT(*)::bigint as c FROM "BankTransaction" b LEFT JOIN "BankImport" i ON i.id = b."importId" WHERE i.id IS NULL`,
    },
    {
      label: "IncomeInvoice.projectId orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "IncomeInvoice" x LEFT JOIN "Project" p ON p.id = x."projectId" WHERE x."projectId" IS NOT NULL AND p.id IS NULL`,
    },
    {
      label: "IncomeInvoice.incomeCategoryId orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "IncomeInvoice" x LEFT JOIN "IncomeCategory" c ON c.id = x."incomeCategoryId" WHERE x."incomeCategoryId" IS NOT NULL AND c.id IS NULL`,
    },
    {
      label: "CostInvoice.projectId orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "CostInvoice" x LEFT JOIN "Project" p ON p.id = x."projectId" WHERE x."projectId" IS NOT NULL AND p.id IS NULL`,
    },
    {
      label: "CostInvoice.expenseCategoryId orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "CostInvoice" x LEFT JOIN "ExpenseCategory" c ON c.id = x."expenseCategoryId" WHERE x."expenseCategoryId" IS NOT NULL AND c.id IS NULL`,
    },
    {
      label: "IncomeInvoicePlannedPayment orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "IncomeInvoicePlannedPayment" r LEFT JOIN "IncomeInvoice" i ON i.id = r."incomeInvoiceId" WHERE i.id IS NULL`,
    },
    {
      label: "IncomeInvoicePayment orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "IncomeInvoicePayment" r LEFT JOIN "IncomeInvoice" i ON i.id = r."incomeInvoiceId" WHERE i.id IS NULL`,
    },
    {
      label: "CostInvoicePayment orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "CostInvoicePayment" r LEFT JOIN "CostInvoice" i ON i.id = r."costInvoiceId" WHERE i.id IS NULL`,
    },
    {
      label: "CostInvoiceProjectAllocation orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "CostInvoiceProjectAllocation" a LEFT JOIN "CostInvoice" i ON i.id = a."costInvoiceId" LEFT JOIN "Project" p ON p.id = a."projectId" WHERE i.id IS NULL OR p.id IS NULL`,
    },
    {
      label: "IncomeInvoiceProjectAllocation orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "IncomeInvoiceProjectAllocation" a LEFT JOIN "IncomeInvoice" i ON i.id = a."incomeInvoiceId" LEFT JOIN "Project" p ON p.id = a."projectId" WHERE i.id IS NULL OR p.id IS NULL`,
    },
    {
      label: "PlannedEventProjectAllocation orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "PlannedEventProjectAllocation" a LEFT JOIN "PlannedFinancialEvent" e ON e.id = a."plannedFinancialEventId" LEFT JOIN "Project" p ON p.id = a."projectId" WHERE e.id IS NULL OR p.id IS NULL`,
    },
    {
      label: "OtherIncome.projectId orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "OtherIncome" o LEFT JOIN "Project" p ON p.id = o."projectId" WHERE o."projectId" IS NOT NULL AND p.id IS NULL`,
    },
    {
      label: "KsefDocument.syncSessionId orphan",
      sql: `SELECT COUNT(*)::bigint as c FROM "KsefDocument" d LEFT JOIN "KsefSyncSession" s ON s.id = d."syncSessionId" WHERE d."syncSessionId" IS NOT NULL AND s.id IS NULL`,
    },
  ];

  const out: OrphanCheck[] = [];
  for (const { label, sql } of checks) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(sql);
      const c = rows[0]?.c;
      const count = typeof c === "bigint" ? Number(c) : Number(c ?? 0);
      out.push({ label, count });
    } catch (e) {
      out.push({ label: `${label} (error)`, count: -1 });
    }
  }
  return out;
}

async function largeTextStats(): Promise<Record<string, number>> {
  const stats: Record<string, number> = {};
  const queries: Array<[string, string]> = [
    ["IncomeInvoice.notes.maxLen", `SELECT COALESCE(MAX(LENGTH("notes")), 0)::bigint as m FROM "IncomeInvoice"`],
    ["CostInvoice.notes.maxLen", `SELECT COALESCE(MAX(LENGTH("notes")), 0)::bigint as m FROM "CostInvoice"`],
    ["BankTransaction.description.maxLen", `SELECT COALESCE(MAX(LENGTH("description")), 0)::bigint as m FROM "BankTransaction"`],
    ["BankTransaction.dedupeInputText.maxLen", `SELECT COALESCE(MAX(LENGTH("dedupeInputText")), 0)::bigint as m FROM "BankTransaction"`],
    ["KsefDocument.rawPayload.maxLen", `SELECT COALESCE(MAX(LENGTH("rawPayload")), 0)::bigint as m FROM "KsefDocument"`],
    ["BankImport.skippedLinesJson.maxLen", `SELECT COALESCE(MAX(LENGTH("skippedLinesJson")), 0)::bigint as m FROM "BankImport"`],
  ];
  for (const [key, sql] of queries) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ m: bigint | number }[]>(sql);
      const m = rows[0]?.m;
      stats[key] = typeof m === "bigint" ? Number(m) : Number(m ?? 0);
    } catch {
      stats[key] = -1;
    }
  }
  return stats;
}

async function nullViolationSamples(): Promise<string[]> {
  const msgs: string[] = [];
  const checks: Array<{ label: string; sql: string }> = [
    {
      label: "IncomeInvoice.invoiceNumber NULL",
      sql: `SELECT COUNT(*)::bigint as c FROM "IncomeInvoice" WHERE "invoiceNumber" IS NULL`,
    },
    {
      label: "CostInvoice.documentNumber NULL",
      sql: `SELECT COUNT(*)::bigint as c FROM "CostInvoice" WHERE "documentNumber" IS NULL`,
    },
    {
      label: "User.email / passwordHash NULL",
      sql: `SELECT COUNT(*)::bigint as c FROM "User" WHERE "email" IS NULL OR "passwordHash" IS NULL`,
    },
  ];
  for (const { label, sql } of checks) {
    const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(sql);
    const c = rows[0]?.c;
    const n = typeof c === "bigint" ? Number(c) : Number(c ?? 0);
    if (n > 0) msgs.push(`${label}: ${n} wierszy`);
  }
  return msgs;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19).replace("T", "_");
  const reportsDir = resolve(process.cwd(), "reports");
  mkdirSync(reportsDir, { recursive: true });
  const base = resolve(reportsDir, `postgres-validation-${stamp}`);

  const tables = await tableNames();
  const counts: Record<string, number> = {};
  for (const t of tables) {
    try {
      counts[t] = await tableCount(t);
    } catch {
      counts[t] = -1;
    }
  }

  const [incomeSum, costSum, bankSum, taskCount, userCount, appSettingsRows] = await Promise.all([
    prisma.incomeInvoice.aggregate({
      _sum: { netAmount: true, vatAmount: true, grossAmount: true },
      _count: { _all: true },
    }),
    prisma.costInvoice.aggregate({
      _sum: { netAmount: true, vatAmount: true, grossAmount: true },
      _count: { _all: true },
    }),
    prisma.bankTransaction.aggregate({ _sum: { amount: true }, _count: { _all: true } }),
    prisma.projectTask.count(),
    prisma.user.count(),
    prisma.appSettings.findMany({ select: { id: true } }),
  ]);

  const dateRanges: Record<string, { min: string | null; max: string | null }> = {};
  function fmtDate(v: string | Date | null): string | null {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString();
    const n = Number(v);
    if (!Number.isNaN(n) && String(v).length >= 12) return new Date(n).toISOString();
    return String(v);
  }
  async function rng(model: string, field: string) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ mn: Date | string | null; mx: Date | string | null }[]>(
        `SELECT MIN("${field}") as mn, MAX("${field}") as mx FROM "${model}"`,
      );
      dateRanges[`${model}.${field}`] = {
        min: fmtDate(rows[0]?.mn ?? null),
        max: fmtDate(rows[0]?.mx ?? null),
      };
    } catch {
      dateRanges[`${model}.${field}`] = { min: null, max: null };
    }
  }
  await rng("IncomeInvoice", "issueDate");
  await rng("CostInvoice", "documentDate");
  await rng("BankTransaction", "bookingDate");
  await rng("PlannedFinancialEvent", "plannedDate");
  await rng("ProjectTask", "createdAt");

  const orphans = await runOrphanChecks();
  const largeText = await largeTextStats();
  const nullViolations = await nullViolationSamples();

  const issues: string[] = [];
  if (userCount === 0) issues.push("Brak użytkowników (User: 0) — trzeba npm run create-admin.");
  if (appSettingsRows.length !== 1 || appSettingsRows[0]?.id !== 1) {
    issues.push(
      `AppSettings: oczekiwany dokładnie 1 wiersz z id=1, jest ${appSettingsRows.length} (id: ${appSettingsRows.map((r) => r.id).join(", ")})`,
    );
  }
  for (const o of orphans) {
    if (o.count > 0) issues.push(`Orphan FK: ${o.label} → ${o.count}`);
  }
  for (const m of nullViolations) issues.push(`Null: ${m}`);
  for (const [k, v] of Object.entries(largeText)) {
    if (v > 500_000) issues.push(`Bardzo długi tekst: ${k} = ${v} znaków (max)`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    tables,
    counts,
    aggregates: {
      IncomeInvoice: {
        rows: incomeSum._count._all,
        sumNet: incomeSum._sum.netAmount?.toString() ?? "0",
        sumVat: incomeSum._sum.vatAmount?.toString() ?? "0",
        sumGross: incomeSum._sum.grossAmount?.toString() ?? "0",
      },
      CostInvoice: {
        rows: costSum._count._all,
        sumNet: costSum._sum.netAmount?.toString() ?? "0",
        sumVat: costSum._sum.vatAmount?.toString() ?? "0",
        sumGross: costSum._sum.grossAmount?.toString() ?? "0",
      },
      BankTransaction: {
        rows: bankSum._count._all,
        sumAmountGrosze:
          bankSum._sum.amount !== null && bankSum._sum.amount !== undefined
            ? Number(bankSum._sum.amount)
            : 0,
      },
      ProjectTask: { rows: taskCount },
      User: { rows: userCount },
      AppSettings: { rows: appSettingsRows.length, ids: appSettingsRows.map((r) => r.id) },
    },
    dateRanges,
    orphanForeignKeys: orphans,
    largeTextMaxLengths: largeText,
    nullChecks: nullViolations,
    issues,
  };

  const txt = [
    `PostgreSQL validation — ${summary.generatedAt}`,
    "",
    `Tabele (${tables.length}): ${tables.join(", ")}`,
    "",
    "Liczniki:",
    ...tables.map((t) => `  ${t}: ${counts[t]}`),
    "",
    "Agregaty:",
    `  IncomeInvoice: ${JSON.stringify(summary.aggregates.IncomeInvoice)}`,
    `  CostInvoice: ${JSON.stringify(summary.aggregates.CostInvoice)}`,
    `  BankTransaction: ${JSON.stringify(summary.aggregates.BankTransaction)}`,
    `  ProjectTask: ${taskCount}, User: ${userCount}, AppSettings rows: ${appSettingsRows.length}`,
    "",
    "Zakresy dat:",
    ...Object.entries(dateRanges).map(([k, v]) => `  ${k}: ${v.min} … ${v.max}`),
    "",
    "Orphan FK:",
    ...orphans.map((o) => `  ${o.label}: ${o.count}`),
    "",
    "Długości tekstów (max):",
    ...Object.entries(largeText).map(([k, v]) => `  ${k}: ${v}`),
    "",
    "Problemy / ostrzeżenia:",
    ...(issues.length ? issues.map((i) => `  ⚠ ${i}`) : ["  (brak)"]),
  ].join("\n");

  writeFileSync(`${base}.json`, JSON.stringify(summary, replacerJson, 2), "utf8");
  writeFileSync(`${base}.txt`, txt, "utf8");

  console.log(txt);
  console.log(`\nZapisano: ${base}.json oraz ${base}.txt`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
