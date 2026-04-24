import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { getForecastClosingBalancesForDay } from "@/lib/cashflow/forecast-expected-for-day";
import { round2 } from "@/lib/cashflow/money";
import { PAY_EPS } from "@/lib/cashflow/settlement";
import { parseDecimalNumber } from "@/lib/decimal-input";
import { DAILY_RECON_STATUS } from "@/lib/cashflow/daily-reconciliation-status";
import { z } from "zod";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from")?.trim() ?? "";
  const to = searchParams.get("to")?.trim() ?? "";
  if (!YMD.test(from) || !YMD.test(to)) {
    return jsonError("Podaj poprawne from i to w formacie YYYY-MM-DD.", 400);
  }
  if (from > to) return jsonError("Zakres: from nie może być większe niż to.", 400);

  const items = await prisma.dailyCashReconciliation.findMany({
    where: { dayKey: { gte: from, lte: to } },
    orderBy: { dayKey: "asc" },
  });

  return jsonData({ items });
}

const putBodySchema = z.object({
  dayKey: z.string().regex(YMD, "Oczekiwany format daty: YYYY-MM-DD"),
  mainBankBalance: z.union([z.string(), z.number()]),
  vatBankBalance: z.union([z.string(), z.number()]),
  note: z.string().max(2000).optional().default(""),
});

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON", 400);
  }
  const parsed = putBodySchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { dayKey, note } = parsed.data;
  const mainBank = parseDecimalNumber(String(parsed.data.mainBankBalance));
  const vatBank = parseDecimalNumber(String(parsed.data.vatBankBalance));
  if (!Number.isFinite(mainBank) || !Number.isFinite(vatBank)) {
    return jsonError("Podaj poprawne salda MAIN i VAT z banku (liczby).", 422);
  }

  const expected = await getForecastClosingBalancesForDay(dayKey);
  if (!expected) {
    return jsonError("Brak wiersza prognozy dla tego dnia (sprawdź datę).", 404);
  }

  const diffMain = round2(mainBank - expected.mainEnd);
  const diffVat = round2(vatBank - expected.vatEnd);
  const status =
    Math.abs(diffMain) <= PAY_EPS && Math.abs(diffVat) <= PAY_EPS ?
      DAILY_RECON_STATUS.MATCHED
    : DAILY_RECON_STATUS.NEEDS_REVIEW;

  const row = await prisma.dailyCashReconciliation.upsert({
    where: { dayKey },
    create: {
      dayKey,
      mainBankBalance: new Decimal(mainBank.toFixed(2)),
      vatBankBalance: new Decimal(vatBank.toFixed(2)),
      status,
      note: note.trim().slice(0, 2000),
    },
    update: {
      mainBankBalance: new Decimal(mainBank.toFixed(2)),
      vatBankBalance: new Decimal(vatBank.toFixed(2)),
      status,
      note: note.trim().slice(0, 2000),
    },
  });

  return jsonData({
    item: row,
    expectedMainEnd: expected.mainEnd,
    expectedVatEnd: expected.vatEnd,
    diffMain,
    diffVat,
  });
}

const patchAckSchema = z
  .object({
    dayKey: z.string().regex(YMD, "Oczekiwany format daty: YYYY-MM-DD"),
    mainChecked: z.boolean().optional(),
    vatChecked: z.boolean().optional(),
  })
  .refine((b) => b.mainChecked !== undefined || b.vatChecked !== undefined, {
    message: "Podaj mainChecked i/lub vatChecked",
  });

export async function PATCH(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON", 400);
  }
  const parsed = patchAckSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { dayKey } = parsed.data;
  const prev = await prisma.dailyCashReconciliation.findUnique({ where: { dayKey } });
  const nextMain = parsed.data.mainChecked ?? prev?.mainChecked ?? false;
  const nextVat = parsed.data.vatChecked ?? prev?.vatChecked ?? false;

  const row = await prisma.dailyCashReconciliation.upsert({
    where: { dayKey },
    create: {
      dayKey,
      mainBankBalance: new Decimal(0),
      vatBankBalance: new Decimal(0),
      status: DAILY_RECON_STATUS.MATCHED,
      note: "",
      mainChecked: nextMain,
      vatChecked: nextVat,
    },
    update: {
      ...(parsed.data.mainChecked !== undefined ? { mainChecked: parsed.data.mainChecked } : {}),
      ...(parsed.data.vatChecked !== undefined ? { vatChecked: parsed.data.vatChecked } : {}),
    },
  });

  return jsonData({ item: row });
}
