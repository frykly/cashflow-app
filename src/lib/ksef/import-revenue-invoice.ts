import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import { ensureClosingIncomePaymentIfFullySettled } from "@/lib/cashflow/invoice-auto-settlement";
import { syncIncomeInvoiceStatus } from "@/lib/invoice-status-sync";
import { inferVatRateFromAmounts } from "@/lib/vat-rate";
import { findProbableIncomeDuplicate } from "./duplicate-match";
import { ksefImportNotes } from "./ksef-import-marker";

const ALREADY_IN_SYSTEM_MSG = "Ta faktura prawdopodobnie już istnieje w systemie";

export async function importKsefDocumentAsRevenue(documentId: string) {
  const doc = await prisma.ksefDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Nie znaleziono dokumentu KSeF.");
  if (doc.documentDirection !== "SALE") {
    throw new Error("Import przychodu dostępny tylko dla dokumentów sprzedażowych.");
  }
  if (doc.workflowStatus === "IMPORTED") {
    throw new Error("Dokument został już zaimportowany.");
  }
  if (doc.workflowStatus === "REJECTED") {
    throw new Error("Odrzucony dokument nie może być importowany.");
  }
  if (doc.workflowStatus === "PROBABLE_DUPLICATE") {
    throw new Error("Dokument oznaczony jako już w systemie — przywróć do nowych przed importem.");
  }
  if (!doc.invoiceNumber.trim()) {
    throw new Error("Brak numeru faktury w dokumencie KSeF.");
  }
  if (!doc.buyerName.trim()) {
    throw new Error("Brak nabywcy (kontrahenta) w dokumencie KSeF.");
  }

  const probable = await findProbableIncomeDuplicate({
    invoiceNumber: doc.invoiceNumber,
    buyerTaxId: doc.buyerTaxId,
    buyerName: doc.buyerName,
    grossAmount: doc.grossAmount,
    issueDate: doc.issueDate,
  });
  if (probable) {
    await prisma.ksefDocument.update({
      where: { id: doc.id },
      data: {
        workflowStatus: "PROBABLE_DUPLICATE",
        duplicateOfIncomeInvoiceId: probable.id,
        duplicateOfCostInvoiceId: null,
        duplicateMatchSummary: probable.summary,
        processedAt: new Date(),
      },
    });
    throw new Error(`${ALREADY_IN_SYSTEM_MSG}: ${probable.summary}`);
  }

  const net = decToNumber(doc.netAmount);
  const vat = decToNumber(doc.vatAmount);
  const gross = decToNumber(doc.grossAmount);
  const vatRate = inferVatRateFromAmounts(net, vat);
  const issueDate = doc.issueDate;
  const paymentDueDate = doc.paymentDueDate ?? doc.issueDate;
  const plannedIncomeDate = doc.paymentDueDate ?? doc.issueDate;
  const now = new Date();

  const income = await prisma.$transaction(async (tx) => {
    const created = await tx.incomeInvoice.create({
      data: {
        invoiceNumber: doc.invoiceNumber.trim(),
        contractor: doc.buyerName.trim(),
        description: "",
        vatRate,
        netAmount: net,
        vatAmount: vat,
        grossAmount: gross,
        issueDate,
        paymentDueDate,
        plannedIncomeDate,
        status: "WYSTAWIONA",
        vatDestination: "MAIN",
        confirmedIncome: false,
        notes: ksefImportNotes(doc.ksefId),
        projectId: null,
        projectName: null,
        incomeCategoryId: null,
      },
    });

    await tx.ksefDocument.update({
      where: { id: doc.id },
      data: {
        importedAsRevenueInvoiceId: created.id,
        workflowStatus: "IMPORTED",
        importedAt: now,
        processedAt: now,
      },
    });

    return created;
  });

  await ensureClosingIncomePaymentIfFullySettled(income.id);
  await syncIncomeInvoiceStatus(income.id);

  const fresh = await prisma.incomeInvoice.findUnique({
    where: { id: income.id },
    include: { incomeCategory: true, project: true, payments: true },
  });

  const updatedDoc = await prisma.ksefDocument.findUnique({ where: { id: doc.id } });

  return { incomeInvoice: fresh ?? income, ksefDocument: updatedDoc };
}
