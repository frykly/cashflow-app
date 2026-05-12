/**
 * Import danych z JSON (npm run export:sqlite-data) do bazy PostgreSQL.
 * Wymaga: migrate deploy na pustej bazie, DATABASE_URL/DIRECT_URL wskazują Postgres.
 *
 * Użycie:
 *   SQLITE_EXPORT_DIR=exports/sqlite-export-<stamp> npm run import:sqlite-json-to-postgres
 *
 * Opcjonalnie pierwszy argument: ścieżka do katalogu eksportu.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

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

/** Kolejność zgodna z FK (patrz docs/postgres-migration.md). */
const IMPORT_ORDER = [
  "AppSettings",
  "DailyCashReconciliation",
  "ProjectLifecycleStatusOption",
  "ProjectSettlementStatusOption",
  "ProjectMissingTypeOption",
  "IncomeCategory",
  "ExpenseCategory",
  "User",
  "Contractor",
  "ContractorAlias",
  "Project",
  "ProjectTask",
  "ProjectMissingItem",
  "RecurringTemplate",
  "BankImport",
  "BankTransaction",
  "IncomeInvoice",
  "IncomeInvoicePlannedPayment",
  "IncomeInvoicePayment",
  "IncomeInvoicePaymentProjectAllocation",
  "IncomeInvoiceProjectAllocation",
  "CostInvoice",
  "CostInvoicePayment",
  "CostInvoicePaymentProjectAllocation",
  "CostInvoiceProjectAllocation",
  "PlannedFinancialEvent",
  "PlannedEventProjectAllocation",
  "OtherIncome",
  "KsefSyncSession",
  "KsefDocument",
] as const;

type ImportTable = (typeof IMPORT_ORDER)[number];

const BOOL_KEYS = new Set([
  "mainChecked",
  "vatChecked",
  "isActive",
  "isDone",
  "confirmedIncome",
  "isGeneratedFromRecurring",
  "isRecurringDetached",
  "paid",
]);

const INT_KEYS = new Set<string>([
  "AppSettings.id",
  "BankTransaction.amount",
  "IncomeInvoice.vatRate",
  "CostInvoice.vatRate",
  "IncomeInvoicePlannedPayment.sortOrder",
  "ProjectLifecycleStatusOption.sortOrder",
  "ProjectSettlementStatusOption.sortOrder",
  "ProjectMissingTypeOption.sortOrder",
  "RecurringTemplate.dayOfMonth",
  "RecurringTemplate.weekday",
]);

function isDateField(table: string, k: string): boolean {
  if (k === "dayKey") return false;
  if (table === "OtherIncome" && k === "date") return true;
  return k.endsWith("At") || k.endsWith("Date");
}

function isDecimalField(table: string, k: string): boolean {
  const ck = `${table}.${k}`;
  if (INT_KEYS.has(ck)) return false;
  if (BOOL_KEYS.has(k)) return false;
  if (table === "BankTransaction" && k === "amount") return false;
  if (isDateField(table, k)) return false;
  if (k === "id" || k === "sortOrder" || k === "vatRate" || k === "dayOfMonth" || k === "weekday")
    return false;
  return (
    /(Amount|Balance)$/i.test(k) ||
    /(Net|Gross)$/i.test(k) ||
    k === "amount" ||
    k === "amountVat" ||
    k === "mainOpeningBalance" ||
    k === "vatOpeningBalance" ||
    k === "mainBankBalance" ||
    k === "vatBankBalance"
  );
}

function coerceBool(v: unknown): boolean {
  if (v === true || v === false) return v;
  if (v === 1 || v === "1") return true;
  if (v === 0 || v === "0") return false;
  return Boolean(v);
}

function coerceRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    if (v === null) {
      out[k] = null;
      continue;
    }
    const ck = `${table}.${k}`;
    if (BOOL_KEYS.has(k)) {
      out[k] = coerceBool(v);
      continue;
    }
    if (INT_KEYS.has(ck)) {
      out[k] = typeof v === "number" ? Math.trunc(v) : parseInt(String(v), 10);
      continue;
    }
    if (isDateField(table, k)) {
      if (typeof v === "number") out[k] = new Date(v);
      else out[k] = new Date(String(v));
      continue;
    }
    if (isDecimalField(table, k)) {
      out[k] = new Prisma.Decimal(String(v));
      continue;
    }
    out[k] = v;
  }
  return out;
}

async function insertTable(prisma: PrismaClient, table: ImportTable, rows: Record<string, unknown>[]) {
  switch (table) {
    case "AppSettings":
      await prisma.appSettings.createMany({
        data: rows as Prisma.AppSettingsCreateManyInput[],
      });
      break;
    case "DailyCashReconciliation":
      await prisma.dailyCashReconciliation.createMany({
        data: rows as Prisma.DailyCashReconciliationCreateManyInput[],
      });
      break;
    case "ProjectLifecycleStatusOption":
      await prisma.projectLifecycleStatusOption.createMany({
        data: rows as Prisma.ProjectLifecycleStatusOptionCreateManyInput[],
      });
      break;
    case "ProjectSettlementStatusOption":
      await prisma.projectSettlementStatusOption.createMany({
        data: rows as Prisma.ProjectSettlementStatusOptionCreateManyInput[],
      });
      break;
    case "ProjectMissingTypeOption":
      await prisma.projectMissingTypeOption.createMany({
        data: rows as Prisma.ProjectMissingTypeOptionCreateManyInput[],
      });
      break;
    case "IncomeCategory":
      await prisma.incomeCategory.createMany({ data: rows as Prisma.IncomeCategoryCreateManyInput[] });
      break;
    case "ExpenseCategory":
      await prisma.expenseCategory.createMany({
        data: rows as Prisma.ExpenseCategoryCreateManyInput[],
      });
      break;
    case "User":
      await prisma.user.createMany({ data: rows as Prisma.UserCreateManyInput[] });
      break;
    case "Contractor":
      await prisma.contractor.createMany({ data: rows as Prisma.ContractorCreateManyInput[] });
      break;
    case "ContractorAlias":
      await prisma.contractorAlias.createMany({
        data: rows as Prisma.ContractorAliasCreateManyInput[],
      });
      break;
    case "Project":
      await prisma.project.createMany({ data: rows as Prisma.ProjectCreateManyInput[] });
      break;
    case "ProjectTask":
      await prisma.projectTask.createMany({ data: rows as Prisma.ProjectTaskCreateManyInput[] });
      break;
    case "ProjectMissingItem":
      await prisma.projectMissingItem.createMany({
        data: rows as Prisma.ProjectMissingItemCreateManyInput[],
      });
      break;
    case "RecurringTemplate":
      await prisma.recurringTemplate.createMany({
        data: rows as Prisma.RecurringTemplateCreateManyInput[],
      });
      break;
    case "BankImport":
      await prisma.bankImport.createMany({ data: rows as Prisma.BankImportCreateManyInput[] });
      break;
    case "BankTransaction":
      await prisma.bankTransaction.createMany({
        data: rows as Prisma.BankTransactionCreateManyInput[],
      });
      break;
    case "IncomeInvoice":
      await prisma.incomeInvoice.createMany({
        data: rows as Prisma.IncomeInvoiceCreateManyInput[],
      });
      break;
    case "IncomeInvoicePlannedPayment":
      await prisma.incomeInvoicePlannedPayment.createMany({
        data: rows as Prisma.IncomeInvoicePlannedPaymentCreateManyInput[],
      });
      break;
    case "IncomeInvoicePayment":
      await prisma.incomeInvoicePayment.createMany({
        data: rows as Prisma.IncomeInvoicePaymentCreateManyInput[],
      });
      break;
    case "IncomeInvoicePaymentProjectAllocation":
      await prisma.incomeInvoicePaymentProjectAllocation.createMany({
        data: rows as Prisma.IncomeInvoicePaymentProjectAllocationCreateManyInput[],
      });
      break;
    case "IncomeInvoiceProjectAllocation":
      await prisma.incomeInvoiceProjectAllocation.createMany({
        data: rows as Prisma.IncomeInvoiceProjectAllocationCreateManyInput[],
      });
      break;
    case "CostInvoice":
      await prisma.costInvoice.createMany({ data: rows as Prisma.CostInvoiceCreateManyInput[] });
      break;
    case "CostInvoicePayment":
      await prisma.costInvoicePayment.createMany({
        data: rows as Prisma.CostInvoicePaymentCreateManyInput[],
      });
      break;
    case "CostInvoicePaymentProjectAllocation":
      await prisma.costInvoicePaymentProjectAllocation.createMany({
        data: rows as Prisma.CostInvoicePaymentProjectAllocationCreateManyInput[],
      });
      break;
    case "CostInvoiceProjectAllocation":
      await prisma.costInvoiceProjectAllocation.createMany({
        data: rows as Prisma.CostInvoiceProjectAllocationCreateManyInput[],
      });
      break;
    case "PlannedFinancialEvent":
      await prisma.plannedFinancialEvent.createMany({
        data: rows as Prisma.PlannedFinancialEventCreateManyInput[],
      });
      break;
    case "PlannedEventProjectAllocation":
      await prisma.plannedEventProjectAllocation.createMany({
        data: rows as Prisma.PlannedEventProjectAllocationCreateManyInput[],
      });
      break;
    case "OtherIncome":
      await prisma.otherIncome.createMany({ data: rows as Prisma.OtherIncomeCreateManyInput[] });
      break;
    case "KsefSyncSession":
      await prisma.ksefSyncSession.createMany({
        data: rows as Prisma.KsefSyncSessionCreateManyInput[],
      });
      break;
    case "KsefDocument":
      await prisma.ksefDocument.createMany({ data: rows as Prisma.KsefDocumentCreateManyInput[] });
      break;
    default: {
      const _exhaustive: never = table;
      throw new Error(`Nieobsługiwana tabela: ${_exhaustive}`);
    }
  }
}

async function main() {
  const dirFromEnv = process.env.SQLITE_EXPORT_DIR?.trim();
  const dirFromArg = process.argv[2]?.trim();
  const dir = resolve(process.cwd(), dirFromArg || dirFromEnv || "");
  if (!dir || !existsSync(dir)) {
    console.error(
      "Podaj katalog eksportu: pierwszy argument CLI lub SQLITE_EXPORT_DIR (względem katalogu projektu).",
    );
    process.exit(1);
  }
  const manifestPath = resolve(dir, "manifest.json");
  if (!existsSync(manifestPath)) {
    console.warn("Brak manifest.json — import wg stałej kolejności IMPORT_ORDER.");
  }

  const prisma = new PrismaClient();

  try {
    for (const table of IMPORT_ORDER) {
      const file = resolve(dir, `${table}.json`);
      if (!existsSync(file)) {
        console.warn(`Pomijam (brak pliku): ${table}.json`);
        continue;
      }
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>[];
      if (!Array.isArray(raw) || raw.length === 0) continue;
      const rows = raw.map((r) => coerceRow(table, r));
      await insertTable(prisma, table, rows);
      console.log(`OK ${table}: ${rows.length} wierszy`);
    }
    console.log("\nImport zakończony.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
