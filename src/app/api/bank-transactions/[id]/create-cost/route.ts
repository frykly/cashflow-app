import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { resolveCostInvoiceAmounts } from "@/lib/validation/cost-invoice-amounts";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { resolveProjectFields } from "@/lib/project-persist";
import type { VatRatePct } from "@/lib/vat-rate";
import { healBankTransactionLinks } from "@/lib/bank-import/heal-links";
import { assertCostLinkSign, BANK_COST_PAYMENT_NOTE } from "@/lib/bank-import/payment-from-bank";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { finalizeNewCostPaymentAllocations } from "@/lib/payment-project-allocation/finalize";
import { inferDocumentNumberFromBankText } from "@/lib/bank-import/parse-document-number";
import { isExpenseCategoryBankFeesLike, looksLikeBankFeeDescription } from "@/lib/bank-import/bank-fee-heuristic";
import { finalizePlannedToCostConversion } from "@/lib/planned-event-conversion";
import { decToNumber, round2 } from "@/lib/cashflow/money";
import { PAY_EPS, sumCostPaymentsGross } from "@/lib/cashflow/settlement";
import {
  replaceCostInvoiceAllocations,
  replacePlannedEventAllocations,
  resolveLegacyProjectFieldsFromAllocations,
  type CostAllocInput,
} from "@/lib/project-allocations/persist";
import { validateCostOrIncomeAllocationSums } from "@/lib/project-allocations/validate";
import { z } from "zod";

/** ID rekordów Prisma to CUID, nie UUID — `.uuid()` odrzucało poprawne kategorie. */
const optionalCuidLike = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.union([z.null(), z.string().min(1).max(64)]),
);

const bankCostAllocRowSchema = z.object({
  projectId: z.string().min(1),
  netAmount: z.union([z.number(), z.string()]),
  grossAmount: z.union([z.number(), z.string()]),
  description: z.string().max(500).optional().default(""),
});

const createCostBodySchema = z.object({
  documentNumber: z.string().max(120).optional().nullable(),
  supplier: z.string().max(500).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  expenseCategoryId: optionalCuidLike,
  projectId: z.string().min(1).optional().nullable(),
  /** Utwórz koszt wg pól z planu; przy zgodności kwoty zamyka zdarzenie planowane (CONVERTED). */
  plannedEventId: optionalCuidLike,
  /**
   * Gdy kwota z banku różni się od sumy planu (|Δ| &gt; 2 gr): wymagane — jak potraktować różnicę.
   * ADJUST_AND_CLOSE — dopasuj kwoty planu do rzeczywistej płatności i oznacz plan jako CONVERTED.
   * PARTIAL_LEAVE_OPEN — zaksięguj płatność, w planie zostaje niedopłata (status PLANNED).
   */
  plannedResolution: z.enum(["ADJUST_AND_CLOSE", "PARTIAL_LEAVE_OPEN"]).optional(),
  /** ≥2 wiersze: jeden koszt z wyciągu, podział brutto/netto (0% VAT) na projekty — bez migracji DB. */
  projectAllocations: z.array(bankCostAllocRowSchema).max(20).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bankTxId } = await ctx.params;

  let bodyRaw: unknown = {};
  try {
    const t = await req.text();
    if (t.trim()) bodyRaw = JSON.parse(t) as unknown;
  } catch {
    return jsonError("Nieprawidłowy JSON", 400);
  }

  const parsedBody = createCostBodySchema.safeParse(bodyRaw);
  if (!parsedBody.success) {
    const catIssue = parsedBody.error.issues.find((i) => i.path[0] === "expenseCategoryId");
    if (catIssue) {
      return jsonError(
        "Nieprawidłowy identyfikator kategorii kosztu. Wybierz kategorię z listy albo pozostaw pole puste.",
        422,
      );
    }
    return jsonError("Nieprawidłowe pola formularza", 422);
  }

  const tx = await prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
  if (!tx) return jsonError("Nie znaleziono transakcji", 404);

  try {
    assertCostLinkSign(tx.amount);
  } catch {
    return jsonError("Koszt z wyciągu: oczekiwana transakcja ujemna (wypłata).", 400);
  }

  await healBankTransactionLinks(prisma, tx.importId);
  const fresh = await prisma.bankTransaction.findUnique({ where: { id: bankTxId } });
  if (!fresh) return jsonError("Nie znaleziono transakcji", 404);

  if (["VAT_TOPUP", "DUPLICATE", "IGNORED"].includes(fresh.status)) {
    return jsonError("Ten status nie pozwala na utworzenie kosztu z tej transakcji.", 400);
  }

  const incomePayCount = await prisma.incomeInvoicePayment.count({ where: { bankTransactionId: bankTxId } });
  if (incomePayCount > 0) {
    return jsonError("Dla tej transakcji są już wpłaty na faktury przychodu — użyj „Cofnij”.", 409);
  }

  const otherInc = await prisma.otherIncome.findUnique({ where: { bankTransactionId: bankTxId } });
  if (otherInc) return jsonError("Dla tej transakcji zapisano już przychód bez faktury — użyj „Cofnij”.", 409);

  const absGrosze = Math.abs(fresh.amount);
  if (absGrosze === 0) return jsonError("Kwota 0 — nie można utworzyć kosztu", 400);

  const costPaysForBank = await prisma.costInvoicePayment.findMany({
    where: { bankTransactionId: bankTxId },
    select: { amountGross: true },
  });
  const allocatedPln = sumCostPaymentsGross(costPaysForBank);
  const bankAbsPln = absGrosze / 100;
  const remainingPln = round2(bankAbsPln - allocatedPln);

  if (remainingPln <= PAY_EPS) {
    return jsonError(
      "Cała kwota z tej linii banku jest już rozdzielona na płatności — nie można utworzyć kolejnego kosztu. Użyj „Cofnij”, jeśli chcesz zmienić przypisanie.",
      409,
    );
  }

  const grossPln = new Decimal(remainingPln.toFixed(2)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const resolved = resolveCostInvoiceAmounts({
    vatOnly: false,
    netAmount: grossPln.toString(),
    vatRate: 0 as VatRatePct,
  });
  if (!resolved.ok) return jsonError(resolved.message);

  const { net, vat, gross, storedVatRate } = resolved.amounts;

  const b = parsedBody.data;

  let documentAllocs: CostAllocInput[] | null = null;
  if (b.projectAllocations && b.projectAllocations.length >= 2) {
    documentAllocs = b.projectAllocations.map((r) => ({
      projectId: r.projectId,
      netAmount: normalizeDecimalInput(String(r.netAmount)),
      grossAmount: normalizeDecimalInput(String(r.grossAmount)),
      description: r.description?.trim() ?? "",
    }));
    const allocErr = validateCostOrIncomeAllocationSums(documentAllocs, net.toString(), gross.toString());
    if (allocErr) return jsonError(allocErr, 400);
  }

  const plannedPe =
    b.plannedEventId ?
      await prisma.plannedFinancialEvent.findUnique({
        where: { id: b.plannedEventId },
        include: { projectAllocations: true },
      })
    : null;

  if (b.plannedEventId) {
    if (!plannedPe) return jsonError("Nie znaleziono zdarzenia planowanego", 404);
    if (plannedPe.type !== "EXPENSE") return jsonError("Tylko planowany koszt (EXPENSE) może być powiązany z importem.", 400);
    if (plannedPe.status !== "PLANNED") {
      return jsonError("Zdarzenie planowe musi mieć status PLANNED (np. już skonwertowane).", 400);
    }
    if (plannedPe.convertedToCostInvoiceId || plannedPe.convertedToIncomeInvoiceId) {
      return jsonError("To zdarzenie planowe jest już powiązane z dokumentem księgowym.", 409);
    }
  }

  const plannedTotalGrosze = plannedPe
    ? Math.round((decToNumber(plannedPe.amount as never) + decToNumber(plannedPe.amountVat as never)) * 100)
    : 0;
  const targetGroszeForPlan = Math.round(remainingPln * 100);
  const plannedBankGroszeDiff = plannedPe ? plannedTotalGrosze - targetGroszeForPlan : 0;
  const closePlannedOnMatch =
    Boolean(plannedPe) && Math.abs(plannedTotalGrosze - targetGroszeForPlan) <= 2;

  if (plannedPe && !closePlannedOnMatch) {
    if (!b.plannedResolution) {
      return jsonError(
        "Kwota z wyciągu różni się od sumy planu — podaj plannedResolution: ADJUST_AND_CLOSE (dopasuj i zamknij) albo PARTIAL_LEAVE_OPEN (częściowa płatność, niedopłata w planie).",
        422,
      );
    }
    if (b.plannedResolution === "PARTIAL_LEAVE_OPEN" && plannedBankGroszeDiff <= 2) {
      return jsonError(
        "Częściowa płatność ma sens, gdy kwota z banku jest niższa niż suma planu. Gdy kwota jest wyższa lub równa planowi, wybierz ADJUST_AND_CLOSE.",
        422,
      );
    }
  }

  const inferredDoc = inferDocumentNumberFromBankText(fresh.description);
  const docInput = b.documentNumber?.trim();
  const documentNumber = (docInput || inferredDoc || `BANK-${fresh.id.slice(0, 12)}`).slice(0, 120);

  let projectIdForResolve: string | null = b.projectId?.trim() || null;
  if (!documentAllocs && plannedPe && !projectIdForResolve) {
    const allocs = plannedPe.projectAllocations ?? [];
    if (allocs.length === 1) projectIdForResolve = allocs[0]!.projectId;
    else if (allocs.length > 1) projectIdForResolve = plannedPe.projectId ?? allocs[0]?.projectId ?? null;
    else projectIdForResolve = plannedPe.projectId;
  }

  let description: string;
  if (plannedPe && !b.description?.trim()) {
    description = `${plannedPe.title}${plannedPe.description?.trim() ? `\n${plannedPe.description.trim()}` : ""}`
      .trim()
      .slice(0, 2000);
    if (!description) description = (fresh.description.trim()).slice(0, 2000);
  } else {
    description = (b.description?.trim() ?? fresh.description.trim()).slice(0, 2000);
  }

  let expenseCategoryId: string | null = b.expenseCategoryId ?? null;
  if (plannedPe && !expenseCategoryId) expenseCategoryId = plannedPe.expenseCategoryId;

  let categoryRow: { id: string; name: string; slug: string } | null = null;
  if (expenseCategoryId) {
    const cat = await prisma.expenseCategory.findUnique({
      where: { id: expenseCategoryId },
      select: { id: true, name: true, slug: true, isActive: true },
    });
    if (!cat) {
      return jsonError(
        "Nie znaleziono wybranej kategorii kosztowej — mogła zostać usunięta. Wybierz inną kategorię lub zapisz bez kategorii.",
        400,
      );
    }
    if (!cat.isActive) {
      return jsonError(
        "Wybrana kategoria kosztowa jest zarchiwizowana. Wybierz aktywną kategorię z listy lub usuń kategorię i zapisz ponownie.",
        400,
      );
    }
    categoryRow = { id: cat.id, name: cat.name, slug: cat.slug };
  }

  const descForHeur = (b.description?.trim() ?? fresh.description).trim();
  const bankFeeContext =
    (categoryRow && isExpenseCategoryBankFeesLike(categoryRow)) || looksLikeBankFeeDescription(descForHeur);

  const supplierTrim = b.supplier?.trim() ?? "";
  let supplier: string;
  if (supplierTrim) {
    supplier = supplierTrim.slice(0, 500);
  } else if (plannedPe) {
    try {
      const pidForName = documentAllocs?.[0]?.projectId ?? projectIdForResolve;
      const pfS = await resolveProjectFields(prisma, pidForName);
      supplier = (pfS.projectName ?? plannedPe.title ?? "Wyciąg bankowy").slice(0, 500);
    } catch {
      return jsonError("Nieprawidłowy projekt (plan)", 400);
    }
  } else {
    supplier = (
      bankFeeContext ? "Bank (opłata lub prowizja)" : fresh.counterpartyName?.trim() || "Wyciąg bankowy"
    ).slice(0, 500);
  }

  let pf: { projectId: string | null; projectName: string | null };
  try {
    if (documentAllocs) {
      pf = await resolveLegacyProjectFieldsFromAllocations(prisma, b.projectId?.trim() || null, documentAllocs);
    } else {
      pf = await resolveProjectFields(prisma, projectIdForResolve);
    }
  } catch {
    return jsonError("Nieprawidłowy projekt", 400);
  }

  const docDate = fresh.bookingDate;

  const plannedMismatchNote =
    plannedPe && !closePlannedOnMatch && b.plannedResolution === "PARTIAL_LEAVE_OPEN" ?
      `Z planu „${plannedPe.title}”: częściowa płatność ${(targetGroszeForPlan / 100).toFixed(2)} PLN (w planie pozostało ${(plannedBankGroszeDiff / 100).toFixed(2)} PLN).`
    : "";

  const row = await prisma.$transaction(async (trx) => {
    const cost = await trx.costInvoice.create({
      data: {
        documentNumber,
        supplier,
        description,
        vatRate: storedVatRate,
        netAmount: net,
        vatAmount: vat,
        grossAmount: gross,
        documentDate: docDate,
        paymentDueDate: docDate,
        plannedPaymentDate: docDate,
        status: "DO_ZAPLATY",
        paid: false,
        actualPaymentDate: null,
        paymentSource: fresh.accountType === "VAT" ? "VAT" : "MAIN",
        notes: plannedMismatchNote.slice(0, 2000),
        projectId: pf.projectId,
        projectName: pf.projectName,
        expenseCategoryId,
      },
    });

    const pay = await trx.costInvoicePayment.create({
      data: {
        costInvoiceId: cost.id,
        amountGross: gross,
        paymentDate: docDate,
        notes: `${BANK_COST_PAYMENT_NOTE} (${bankTxId.slice(0, 8)}…)`,
        bankTransactionId: bankTxId,
      },
      select: { id: true },
    });
    if (documentAllocs) {
      await replaceCostInvoiceAllocations(trx, cost.id, documentAllocs);
      await finalizeNewCostPaymentAllocations(
        trx,
        cost.id,
        pay.id,
        normalizeDecimalInput(gross.toString()),
        documentAllocs.map((r) => ({
          projectId: r.projectId,
          grossAmount: r.grossAmount,
          description: r.description,
        })),
      );
    } else {
      await finalizeNewCostPaymentAllocations(trx, cost.id, pay.id, normalizeDecimalInput(gross.toString()), null);
    }

    if (plannedPe && closePlannedOnMatch) {
      await finalizePlannedToCostConversion(trx, plannedPe.id, cost.id);
    } else if (plannedPe && !closePlannedOnMatch && b.plannedResolution === "ADJUST_AND_CLOSE") {
      await trx.plannedFinancialEvent.update({
        where: { id: plannedPe.id },
        data: {
          amount: net,
          amountVat: vat,
        },
      });
      await finalizePlannedToCostConversion(trx, plannedPe.id, cost.id);
    } else if (plannedPe && !closePlannedOnMatch && b.plannedResolution === "PARTIAL_LEAVE_OPEN") {
      const remRatio = plannedBankGroszeDiff / plannedTotalGrosze;
      const pNet = decToNumber(plannedPe.amount as never);
      const pVat = decToNumber(plannedPe.amountVat as never);
      const newNet = round2(pNet * remRatio);
      const newVat = round2(pVat * remRatio);
      const noteLine = `Częściowa płatność z importu ${(targetGroszeForPlan / 100).toFixed(2)} PLN (${fresh.bookingDate.toISOString().slice(0, 10)}); w planie pozostało ${(plannedBankGroszeDiff / 100).toFixed(2)} PLN.`;
      const mergedNotes = [plannedPe.notes?.trim(), noteLine].filter(Boolean).join("\n").slice(0, 2000);

      const pa = plannedPe.projectAllocations ?? [];
      if (pa.length > 0) {
        await replacePlannedEventAllocations(
          trx,
          plannedPe.id,
          pa.map((a) => ({
            projectId: a.projectId,
            amount: round2(decToNumber(a.amount as never) * remRatio).toFixed(2),
            amountVat: round2(decToNumber(a.amountVat as never) * remRatio).toFixed(2),
            description: a.description?.trim() ?? "",
          })),
        );
      }

      await trx.plannedFinancialEvent.update({
        where: { id: plannedPe.id },
        data: {
          amount: new Decimal(newNet.toFixed(2)),
          amountVat: new Decimal(newVat.toFixed(2)),
          status: "PLANNED",
          notes: mergedNotes,
        },
      });
    }

    const bankRow = await trx.bankTransaction.update({
      where: { id: fresh.id },
      data: {
        status: "LINKED_COST",
        createdCostId: fresh.createdCostId ?? cost.id,
        linkedCostInvoiceId: fresh.linkedCostInvoiceId,
      },
    });

    return { cost, bankRow };
  });

  await syncCostInvoiceStatus(row.cost.id);

  const freshCost = await prisma.costInvoice.findUnique({
    where: { id: row.cost.id },
    include: { expenseCategory: true, project: true, payments: { orderBy: { paymentDate: "asc" } } },
  });

  return jsonData(
    {
      bankTransaction: row.bankRow,
      costInvoice: freshCost ?? row.cost,
    },
    { status: 201 },
  );
}
