import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import { ensureClosingCostPaymentIfFullySettled } from "@/lib/cashflow/invoice-auto-settlement";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import { inferVatRateFromAmounts } from "@/lib/vat-rate";
import { findProbableCostDuplicate } from "./duplicate-match";
import { ksefDocumentToPublicRow } from "./document-public-row";

export async function importKsefDocumentAsCost(documentId: string) {
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
    throw new Error(
      "Prawdopodobny duplikat — oznacz jako duplikat lub usuń dopasowanie przed importem.",
    );
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
        duplicateMatchSummary: probable.summary,
      },
    });
    throw new Error(`Prawdopodobny duplikat: ${probable.summary}`);
  }

  const net = decToNumber(doc.netAmount);
  const vat = decToNumber(doc.vatAmount);
  const gross = decToNumber(doc.grossAmount);
  const vatRate = inferVatRateFromAmounts(net, vat);
  const documentDate = doc.issueDate;
  const plannedPaymentDate = doc.paymentDueDate ?? doc.issueDate;
  const now = new Date();

  const cost = await prisma.$transaction(async (tx) => {
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
        paymentDueDate: plannedPaymentDate,
        plannedPaymentDate,
        status: "DO_ZAPLATY",
        paid: false,
        paymentSource: "MAIN",
        notes: `Import KSeF: ${doc.ksefId}`,
        projectId: null,
        projectName: null,
        expenseCategoryId: null,
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
