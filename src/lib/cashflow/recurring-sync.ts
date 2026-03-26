import type { Prisma, RecurringTemplate } from "@prisma/client";
import { addMonths, endOfDay, isBefore, startOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { dayKey } from "@/lib/cashflow/dates";
import { occurrenceDatesInRange } from "@/lib/cashflow/recurring";
import {
  buildRecurringCostSyncPayload,
  buildRecurringCostUncheckedCreate,
  buildRecurringIncomeSyncPayload,
  buildRecurringIncomeUncheckedCreate,
} from "@/lib/cashflow/recurring-generated-invoice";

const HORIZON_MONTHS = 24;

/** Do automatycznej synchronizacji kwot / harmonogramu — tylko czysto planowane (bez utraty stanu „do zapłaty” / wystawionej). */
export function autoSyncableGeneratedCostWhere(templateId: string, today: Date): Prisma.CostInvoiceWhereInput {
  const t = startOfDay(today);
  return {
    sourceRecurringTemplateId: templateId,
    isGeneratedFromRecurring: true,
    isRecurringDetached: false,
    paid: false,
    payments: { none: {} },
    status: "PLANOWANA",
    plannedPaymentDate: { gte: t },
  };
}

export function autoSyncableGeneratedIncomeWhere(templateId: string, today: Date): Prisma.IncomeInvoiceWhereInput {
  const t = startOfDay(today);
  return {
    sourceRecurringTemplateId: templateId,
    isGeneratedFromRecurring: true,
    isRecurringDetached: false,
    payments: { none: {} },
    status: "PLANOWANA",
    plannedIncomeDate: { gte: t },
  };
}

/** Jawne czyszczenie przyszłych wygenerowanych — bez płatności, nie zapłacone w pełni. */
export function deletableFutureGeneratedCostWhere(templateId: string, today: Date): Prisma.CostInvoiceWhereInput {
  const t = startOfDay(today);
  return {
    sourceRecurringTemplateId: templateId,
    isGeneratedFromRecurring: true,
    isRecurringDetached: false,
    paid: false,
    payments: { none: {} },
    status: { notIn: ["ZAPLACONA", "PARTIALLY_PAID"] },
    plannedPaymentDate: { gte: t },
  };
}

export function deletableFutureGeneratedIncomeWhere(templateId: string, today: Date): Prisma.IncomeInvoiceWhereInput {
  const t = startOfDay(today);
  return {
    sourceRecurringTemplateId: templateId,
    isGeneratedFromRecurring: true,
    isRecurringDetached: false,
    payments: { none: {} },
    status: { notIn: ["OPLACONA", "PARTIALLY_RECEIVED"] },
    plannedIncomeDate: { gte: t },
  };
}

function rangeStart(tmpl: RecurringTemplate, today: Date): Date {
  const t = startOfDay(today);
  const s = startOfDay(tmpl.startDate);
  return isBefore(t, s) ? s : t;
}

function rangeEnd(tmpl: RecurringTemplate, today: Date): Date {
  const cap = endOfDay(addMonths(startOfDay(today), HORIZON_MONTHS));
  if (!tmpl.endDate) return cap;
  const e = endOfDay(tmpl.endDate);
  return isBefore(e, cap) ? e : cap;
}

async function costOccurrenceExists(
  tx: Prisma.TransactionClient,
  templateId: string,
  day: Date,
): Promise<boolean> {
  const s = startOfDay(day);
  const e = endOfDay(day);
  const row = await tx.costInvoice.findFirst({
    where: {
      sourceRecurringTemplateId: templateId,
      generatedOccurrenceDate: { gte: s, lte: e },
    },
    select: { id: true },
  });
  return !!row;
}

async function incomeOccurrenceExists(
  tx: Prisma.TransactionClient,
  templateId: string,
  day: Date,
): Promise<boolean> {
  const s = startOfDay(day);
  const e = endOfDay(day);
  const row = await tx.incomeInvoice.findFirst({
    where: {
      sourceRecurringTemplateId: templateId,
      generatedOccurrenceDate: { gte: s, lte: e },
    },
    select: { id: true },
  });
  return !!row;
}

/** Usuwa przyszłe, niezrealizowane wpisy wygenerowane z reguły (z wyjątkiem odłączonych i z płatnościami). */
export async function deleteFutureGeneratedFromTemplate(templateId: string, today = new Date()) {
  const cw = deletableFutureGeneratedCostWhere(templateId, today);
  const iw = deletableFutureGeneratedIncomeWhere(templateId, today);
  const [dc, di] = await prisma.$transaction([
    prisma.costInvoice.deleteMany({ where: cw }),
    prisma.incomeInvoice.deleteMany({ where: iw }),
  ]);
  return { deletedCosts: dc.count, deletedIncomes: di.count };
}

/** Ponownie buduje przyszłe wystąpienia wg aktualnego harmonogramu (najpierw usuwa zsynchronizowalne przyszłe). */
export async function syncRecurringTemplateSchedule(templateId: string, today = new Date()) {
  const tmpl = await prisma.recurringTemplate.findUnique({ where: { id: templateId } });
  if (!tmpl?.isActive) {
    return { created: 0, deletedCosts: 0, deletedIncomes: 0, skippedInactive: true as const };
  }

  const rs = rangeStart(tmpl, today);
  const re = rangeEnd(tmpl, today);
  if (isBefore(re, rs)) {
    return { created: 0, deletedCosts: 0, deletedIncomes: 0, skippedInactive: false as const };
  }

  const dates = occurrenceDatesInRange(tmpl, rs, re);

  return prisma.$transaction(async (tx) => {
    const dc = await tx.costInvoice.deleteMany({ where: autoSyncableGeneratedCostWhere(templateId, today) });
    const di = await tx.incomeInvoice.deleteMany({ where: autoSyncableGeneratedIncomeWhere(templateId, today) });

    let created = 0;
    for (const d of dates) {
      if (tmpl.type === "EXPENSE") {
        await tx.costInvoice.create({ data: buildRecurringCostUncheckedCreate(tmpl, d) });
        created++;
      } else {
        await tx.incomeInvoice.create({ data: buildRecurringIncomeUncheckedCreate(tmpl, d) });
        created++;
      }
    }
    return {
      created,
      deletedCosts: dc.count,
      deletedIncomes: di.count,
      skippedInactive: false as const,
      totalDates: dates.length,
    };
  });
}

/** Aktualizuje kwoty, kontrahenta, kategorie u przyszłych zsynchronizowalnych wpisów z reguły. */
export async function syncRecurringTemplateAmounts(templateId: string, today = new Date()) {
  const tmpl = await prisma.recurringTemplate.findUnique({ where: { id: templateId } });
  if (!tmpl) return { updatedCosts: 0, updatedIncomes: 0 };

  if (tmpl.type === "EXPENSE") {
    const payload = buildRecurringCostSyncPayload(tmpl);
    const r = await prisma.costInvoice.updateMany({
      where: autoSyncableGeneratedCostWhere(templateId, today),
      data: payload,
    });
    return { updatedCosts: r.count, updatedIncomes: 0 };
  }
  const payload = buildRecurringIncomeSyncPayload(tmpl);
  const r = await prisma.incomeInvoice.updateMany({
    where: autoSyncableGeneratedIncomeWhere(templateId, today),
    data: payload,
  });
  return { updatedCosts: 0, updatedIncomes: r.count };
}

/** Tworzy brakujące wystąpienia do końca horyzontu (bez usuwania istniejących). */
export async function generateMissingRecurringOccurrences(templateId: string, untilDate: Date, today = new Date()) {
  const tmpl = await prisma.recurringTemplate.findUnique({ where: { id: templateId } });
  if (!tmpl) return { created: 0, error: "not_found" as const };
  if (!tmpl.isActive) return { created: 0, error: "inactive" as const };

  const rs = rangeStart(tmpl, today);
  const reCap = endOfDay(untilDate);
  const reTpl = rangeEnd(tmpl, today);
  const re = isBefore(reCap, reTpl) ? reCap : reTpl;
  if (isBefore(re, rs)) return { created: 0, error: null };

  const dates = occurrenceDatesInRange(tmpl, rs, re);
  let created = 0;

  await prisma.$transaction(async (tx) => {
    for (const d of dates) {
      if (tmpl.type === "EXPENSE") {
        if (!(await costOccurrenceExists(tx, templateId, d))) {
          await tx.costInvoice.create({ data: buildRecurringCostUncheckedCreate(tmpl, d) });
          created++;
        }
      } else if (!(await incomeOccurrenceExists(tx, templateId, d))) {
        await tx.incomeInvoice.create({ data: buildRecurringIncomeUncheckedCreate(tmpl, d) });
        created++;
      }
    }
  });

  return { created, totalDates: dates.length, error: null };
}

/** Usuwa nadmiarowe przyszłe duplikaty (ten sam dzień wystąpienia, ta sama reguła). Zostawia najstarszy rekord. */
export async function dedupeFutureGeneratedFromTemplate(templateId: string, today = new Date()) {
  const t = startOfDay(today);
  let removedCosts = 0;
  let removedIncomes = 0;

  const costs = await prisma.costInvoice.findMany({
    where: {
      sourceRecurringTemplateId: templateId,
      isGeneratedFromRecurring: true,
      generatedOccurrenceDate: { gte: t },
    },
    orderBy: { createdAt: "asc" },
    include: { payments: true },
  });

  const byDay = new Map<string, typeof costs>();
  for (const c of costs) {
    const gd = c.generatedOccurrenceDate ?? c.plannedPaymentDate;
    const key = dayKey(gd);
    const arr = byDay.get(key) ?? [];
    arr.push(c);
    byDay.set(key, arr);
  }

  for (const [, arr] of byDay) {
    if (arr.length < 2) continue;
    const [, ...rest] = arr;
    for (const row of rest) {
      if (row.isRecurringDetached) continue;
      if (row.paid || row.payments.length > 0) continue;
      if (row.status === "ZAPLACONA" || row.status === "PARTIALLY_PAID") continue;
      if (row.plannedPaymentDate < t) continue;
      await prisma.costInvoice.delete({ where: { id: row.id } });
      removedCosts++;
    }
  }

  const incomes = await prisma.incomeInvoice.findMany({
    where: {
      sourceRecurringTemplateId: templateId,
      isGeneratedFromRecurring: true,
      generatedOccurrenceDate: { gte: t },
    },
    orderBy: { createdAt: "asc" },
    include: { payments: true },
  });

  const byDayI = new Map<string, typeof incomes>();
  for (const inv of incomes) {
    const gd = inv.generatedOccurrenceDate ?? inv.plannedIncomeDate;
    const key = dayKey(gd);
    const arr = byDayI.get(key) ?? [];
    arr.push(inv);
    byDayI.set(key, arr);
  }

  for (const [, arr] of byDayI) {
    if (arr.length < 2) continue;
    const [, ...rest] = arr;
    for (const row of rest) {
      if (row.isRecurringDetached) continue;
      if (row.payments.length > 0) continue;
      if (row.status === "OPLACONA" || row.status === "PARTIALLY_RECEIVED") continue;
      if (row.plannedIncomeDate < t) continue;
      await prisma.incomeInvoice.delete({ where: { id: row.id } });
      removedIncomes++;
    }
  }

  return { removedCosts, removedIncomes };
}
