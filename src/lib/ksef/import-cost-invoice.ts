import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import { ensureClosingCostPaymentIfFullySettled } from "@/lib/cashflow/invoice-auto-settlement";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { resolveLegacyProjectFieldsFromAllocations } from "@/lib/project-allocations/persist";
import type { KsefImportCostBody } from "@/lib/validation/ksef-import-schemas";
import { inferVatRateFromAmounts } from "@/lib/vat-rate";
import { findProbableCostDuplicate } from "./duplicate-match";
import { ksefDocumentToPublicRow } from "./document-public-row";
import { ksefImportNotes } from "./ksef-import-marker";

const ALREADY_IN_SYSTEM_MSG = "Ta faktura prawdopodobnie już istnieje w systemie";

export async function importKsefDocumentAsCost(documentId: string, options: KsefImportCostBody = {}) {
  const doc = await prisma.ksefDocument.findUnique({ where: { id: documentId } });
  if (!doc) throw new Error("Nie znaleziono dokumentu KSeF.");
  if (doc.documentDirection !== "PURCHASE") {
    throw new Error("Import kosztu dostępny tylko dla dokumentów zakupowych.");
  }
  if (doc.workflowStatus === "IMPORTED") {
    throw new Error("Dokument został już zaimportowany.");
  }
  if (doc.workflowStatus === "REJECTED") {
    throw new Error("Odrzucony dokument nie może być importowany.");
  }
  if (!doc.invoiceNumber.trim()) {
    throw new Error("Brak numeru faktury w dokumencie KSeF.");
  }

  if (doc.workflowStatus === "PROBABLE_DUPLICATE") {
    throw new Error("Dokument oznaczony jako już w systemie — przywróć do nowych przed importem.");
  }

  const probable = await findProbableCostDuplicate({
    invoiceNumber: doc.invoiceNumber,
    sellerTaxId: doc.sellerTaxId,
    sellerName: doc.sellerName,
    grossAmount: doc.grossAmount,
  });
  if (probable) {
    await prisma.ksefDocument.update({
      where: { id: doc.id },
      data: {
        workflowStatus: "PROBABLE_DUPLICATE",
        duplicateOfCostInvoiceId: probable.id,
        duplicateOfIncomeInvoiceId: null,
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
  const documentDate = doc.issueDate;
  const paymentDueDate = doc.paymentDueDate ?? doc.issueDate;
  const plannedPaymentDate = options.plannedPaymentDate
    ? new Date(options.plannedPaymentDate)
    : paymentDueDate;
  const now = new Date();

  const cost = await prisma.$transaction(async (tx) => {
    const pf = await resolveLegacyProjectFieldsFromAllocations(tx, options.projectId ?? null, undefined);

    const created = await tx.costInvoice.create({
      data: {
        documentNumber: doc.invoiceNumber.trim(),
        supplier: doc.sellerName.trim(),
        description: "",
        vatRate,
        netAmount: net,
        vatAmount: vat,
        grossAmount: gross,
        documentDate,
        paymentDueDate,
        plannedPaymentDate,
        status: options.status ?? "DO_ZAPLATY",
        paid: false,
        paymentSource: options.paymentSource ?? "MAIN",
        notes: options.notes?.trim() || ksefImportNotes(doc.ksefId),
        projectId: pf.projectId,
        projectName: pf.projectName,
        expenseCategoryId: options.expenseCategoryId ?? null,
      },
    });

    await tx.ksefDocument.update({
      where: { id: doc.id },
      data: {
        importedAsCostInvoiceId: created.id,
        workflowStatus: "IMPORTED",
        importedAt: now,
        processedAt: now,
      },
    });

    return created;
  });

  await ensureClosingCostPaymentIfFullySettled(cost.id);
  await syncCostInvoiceStatus(cost.id);

  const fresh = await prisma.costInvoice.findUnique({
    where: { id: cost.id },
    include: { expenseCategory: true, project: true, payments: true },
  });

  const updatedDoc = await prisma.ksefDocument.findUnique({ where: { id: doc.id } });

  return { costInvoice: fresh ?? cost, ksefDocument: updatedDoc };
}

export { ksefDocumentToPublicRow } from "./document-public-row";
