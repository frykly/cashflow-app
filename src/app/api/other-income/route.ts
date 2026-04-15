import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { serializeOtherIncomeRow } from "@/lib/other-income-api";
import { healBankTransactionLinks } from "@/lib/bank-import/heal-links";
import { assertIncomeLinkSign, bankGroszeToAmountGross } from "@/lib/bank-import/payment-from-bank";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { z } from "zod";

const optionalCuid = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.union([z.null(), z.string().min(1).max(64)]),
);

const optionalVat = z.union([z.string(), z.number()]).optional();

const manualBody = z.object({
  amount: z.union([z.string(), z.number()]),
  vatAmount: optionalVat,
  date: z.string().min(1),
  description: z.string().min(1).max(2000),
  projectId: optionalCuid,
  categoryId: optionalCuid,
});

const bankBody = z.object({
  bankTransactionId: z.string().min(1),
  vatAmount: optionalVat,
  description: z.string().max(2000).optional(),
  projectId: optionalCuid,
  categoryId: optionalCuid,
});

function parseVatAmountOrError(raw: unknown, maxGross: Decimal): { ok: true; vat: Decimal } | { ok: false; message: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, vat: new Decimal(0) };
  }
  const norm = normalizeDecimalInput(String(raw));
  const vat = new Decimal(norm);
  if (!vat.isFinite() || vat.isNaN()) {
    return { ok: false, message: "Nieprawidłowa kwota VAT." };
  }
  if (vat.lt(0)) {
    return { ok: false, message: "Kwota VAT nie może być ujemna." };
  }
  if (vat.gt(maxGross)) {
    return { ok: false, message: "Kwota VAT nie może przekraczać kwoty brutto." };
  }
  return { ok: true, vat };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

export async function GET() {
  const rows = await prisma.otherIncome.findMany({
    orderBy: { date: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    },
  });
  return jsonData({ items: rows.map(serializeOtherIncomeRow) });
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON", 400);
  }

  const fromBank = isRecord(raw) && typeof raw.bankTransactionId === "string" && raw.bankTransactionId.length > 0;

  if (fromBank) {
    const parsed = bankBody.safeParse(raw);
    if (!parsed.success) return jsonError(parsed.error.flatten().formErrors.join("; ") || "Walidacja", 422);

    const tx = await prisma.bankTransaction.findUnique({ where: { id: parsed.data.bankTransactionId } });
    if (!tx) return jsonError("Nie znaleziono transakcji bankowej", 404);

    try {
      assertIncomeLinkSign(tx.amount);
    } catch {
      return jsonError("Ten typ przychodu wymaga wpłaty na konto (kwota dodatnia).", 400);
    }

    if (tx.accountType !== "MAIN") {
      return jsonError("Pozostały przychód z importu jest obsługiwany tylko dla konta głównego (MAIN).", 400);
    }

    await healBankTransactionLinks(prisma, tx.importId);
    const fresh = await prisma.bankTransaction.findUnique({ where: { id: tx.id } });
    if (!fresh) return jsonError("Nie znaleziono transakcji", 404);

    const existingOi = await prisma.otherIncome.findUnique({ where: { bankTransactionId: fresh.id } });
    if (existingOi) return jsonError("Dla tej transakcji zapisano już przychód bez faktury.", 409);

    const [ip, cp] = await Promise.all([
      prisma.incomeInvoicePayment.findFirst({ where: { bankTransactionId: fresh.id } }),
      prisma.costInvoicePayment.findFirst({ where: { bankTransactionId: fresh.id } }),
    ]);
    if (ip || cp) return jsonError("Ta transakcja ma już płatność na fakturze — użyj „Cofnij”.", 409);

    if (fresh.matchedInvoiceId || fresh.linkedCostInvoiceId || fresh.createdCostId) {
      return jsonError("Transakcja jest już powiązana z dokumentem — użyj „Cofnij”.", 409);
    }
    if (["VAT_TOPUP", "DUPLICATE", "IGNORED"].includes(fresh.status)) {
      return jsonError("Ten status nie pozwala na dopisanie przychodu.", 400);
    }

    const desc = (parsed.data.description?.trim() || fresh.description || "Przychód bez faktury").slice(0, 2000);
    const amountGross = bankGroszeToAmountGross(fresh.amount);

    const vatParsed = parseVatAmountOrError(parsed.data.vatAmount, amountGross);
    if (!vatParsed.ok) return jsonError(vatParsed.message, 422);

    if (parsed.data.projectId) {
      const p = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
      if (!p) return jsonError("Nie znaleziono projektu", 404);
    }
    if (parsed.data.categoryId) {
      const c = await prisma.incomeCategory.findUnique({ where: { id: parsed.data.categoryId } });
      if (!c) return jsonError("Nie znaleziono kategorii przychodu", 404);
    }

    const created = await prisma.$transaction(async (trx) => {
      const oi = await trx.otherIncome.create({
        data: {
          amountGross,
          vatAmount: vatParsed.vat,
          date: fresh.bookingDate,
          description: desc,
          projectId: parsed.data.projectId,
          categoryId: parsed.data.categoryId,
          source: "bank_import",
          bankTransactionId: fresh.id,
        },
      });
      await trx.bankTransaction.update({
        where: { id: fresh.id },
        data: { status: "LINKED_OTHER_INCOME" },
      });
      return oi;
    });

    return jsonData(created);
  }

  const parsed = manualBody.safeParse(raw);
  if (!parsed.success) return jsonError(parsed.error.flatten().formErrors.join("; ") || "Walidacja", 422);

  const norm = normalizeDecimalInput(String(parsed.data.amount));
  const dec = new Decimal(norm);
  if (dec.lte(0)) return jsonError("Kwota musi być dodatnia.", 400);

  const vatParsed = parseVatAmountOrError(parsed.data.vatAmount, dec);
  if (!vatParsed.ok) return jsonError(vatParsed.message, 422);

  const d = new Date(parsed.data.date);
  if (Number.isNaN(d.getTime())) return jsonError("Nieprawidłowa data.", 400);

  if (parsed.data.projectId) {
    const p = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
    if (!p) return jsonError("Nie znaleziono projektu", 404);
  }
  if (parsed.data.categoryId) {
    const c = await prisma.incomeCategory.findUnique({ where: { id: parsed.data.categoryId } });
    if (!c) return jsonError("Nie znaleziono kategorii przychodu", 404);
  }

  const created = await prisma.otherIncome.create({
    data: {
      amountGross: dec,
      vatAmount: vatParsed.vat,
      date: d,
      description: parsed.data.description.trim(),
      projectId: parsed.data.projectId,
      categoryId: parsed.data.categoryId,
      source: "manual",
    },
  });

  return jsonData(created);
}
