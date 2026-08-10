import { prisma } from "@/lib/db";
import { ensureClosingCostPaymentIfFullySettled } from "@/lib/cashflow/invoice-auto-settlement";
import { createCostInvoiceCore } from "@/lib/cost-invoices/create-cost-invoice-core";
import { prepareCostInvoiceCreate } from "@/lib/cost-invoices/validate-cost-invoice-create";
import { syncCostInvoiceStatus } from "@/lib/invoice-status-sync";
import {
  buildCostInvoiceCreatePayloadFromKsef,
  resolveKsefImportAmountToPayGross,
} from "@/lib/ksef/build-cost-create-payload";
import { findProbableCostDuplicate } from "./duplicate-match";
import { ksefDocumentToPublicRow } from "./document-public-row";
import type { KsefImportCostBody } from "@/lib/validation/ksef-import-schemas";
import { costInvoiceCreateSchema } from "@/lib/validation/schemas";

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

  const rawPayload = buildCostInvoiceCreatePayloadFromKsef(doc, options);
  const data = costInvoiceCreateSchema.parse(rawPayload);
  const prepared = await prepareCostInvoiceCreate(prisma, data);
  if (!prepared.ok) throw new Error(prepared.message);

  const amountToPayGross = resolveKsefImportAmountToPayGross(doc);

  const now = new Date();

  const cost = await prisma.$transaction(async (tx) => {
    const created = await createCostInvoiceCore(tx, {
      data: prepared.prepared.data,
      amounts: prepared.prepared.amounts,
      amountToPayGross,
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
    include: {
      expenseCategory: true,
      project: true,
      vehicle: true,
      payments: true,
      projectAllocations: { include: { project: { select: { id: true, name: true, code: true } } } },
    },
  });

  const updatedDoc = await prisma.ksefDocument.findUnique({ where: { id: doc.id } });

  return { costInvoice: fresh ?? cost, ksefDocument: updatedDoc };
}

export { ksefDocumentToPublicRow } from "./document-public-row";
