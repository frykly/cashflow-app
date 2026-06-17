import { prisma } from "@/lib/db";
import { applyDuplicateScanToDocument } from "./duplicate-match";
import { isKsefImportedInvoiceNotes } from "./ksef-import-marker";

export type UndoImportResult =
  | { ok: true; ksefDocumentId: string }
  | { ok: false; reasons: string[] };

function block(...reasons: string[]): UndoImportResult {
  return { ok: false, reasons };
}

export async function undoKsefDocumentImport(documentId: string): Promise<UndoImportResult> {
  const doc = await prisma.ksefDocument.findUnique({ where: { id: documentId } });
  if (!doc) {
    return block("Nie znaleziono dokumentu KSeF.");
  }
  if (doc.workflowStatus !== "IMPORTED") {
    return block("Cofnięcie importu jest dostępne tylko dla zaimportowanych dokumentów.");
  }

  const costId = doc.importedAsCostInvoiceId;
  const incomeId = doc.importedAsRevenueInvoiceId;
  if (!costId && !incomeId) {
    return block("Brak powiązanej faktury do cofnięcia importu.");
  }

  if (costId) {
    const cost = await prisma.costInvoice.findUnique({
      where: { id: costId },
      include: {
        payments: { include: { projectAllocations: true } },
        projectAllocations: true,
        linkedFromPlannedEvent: true,
      },
    });

    if (cost) {
      const reasons: string[] = [];
      if (!isKsefImportedInvoiceNotes(cost.notes)) {
        reasons.push("Faktura kosztowa nie została utworzona przez import KSeF — nie można jej bezpiecznie usunąć.");
      }
      if (cost.isGeneratedFromRecurring) {
        reasons.push("Faktura pochodzi z szablonu cyklicznego.");
      }
      if (cost.linkedFromPlannedEvent) {
        reasons.push("Faktura jest powiązana ze zdarzeniem planowanym.");
      }
      if (cost.projectAllocations.length > 0) {
        reasons.push("Faktura ma alokacje na projekty.");
      }
      if (cost.payments.length > 0) {
        reasons.push("Faktura ma zarejestrowane płatności.");
      }
      if (cost.payments.some((p) => p.bankTransactionId)) {
        reasons.push("Płatność jest powiązana z transakcją bankową.");
      }
      if (cost.payments.some((p) => p.projectAllocations.length > 0)) {
        reasons.push("Płatność ma alokacje na projekty.");
      }
      if (reasons.length > 0) {
        return block(
          "Nie można cofnąć importu, bo faktura ma płatności lub powiązania. Usuń ręcznie albo najpierw usuń powiązania.",
          ...reasons,
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.costInvoice.delete({ where: { id: costId } });
        await tx.ksefDocument.update({
          where: { id: documentId },
          data: {
            importedAsCostInvoiceId: null,
            importedAt: null,
            workflowStatus: "NEW",
            processedAt: new Date(),
          },
        });
      });
    } else {
      await prisma.ksefDocument.update({
        where: { id: documentId },
        data: {
          importedAsCostInvoiceId: null,
          importedAt: null,
          workflowStatus: "NEW",
          processedAt: new Date(),
        },
      });
    }
  } else if (incomeId) {
    const income = await prisma.incomeInvoice.findUnique({
      where: { id: incomeId },
      include: {
        payments: { include: { projectAllocations: true } },
        projectAllocations: true,
        plannedPayments: true,
        linkedFromPlannedEvent: true,
      },
    });

    if (income) {
      const reasons: string[] = [];
      if (!isKsefImportedInvoiceNotes(income.notes)) {
        reasons.push("Faktura przychodowa nie została utworzona przez import KSeF — nie można jej bezpiecznie usunąć.");
      }
      if (income.isGeneratedFromRecurring) {
        reasons.push("Faktura pochodzi z szablonu cyklicznego.");
      }
      if (income.linkedFromPlannedEvent) {
        reasons.push("Faktura jest powiązana ze zdarzeniem planowanym.");
      }
      if (income.projectAllocations.length > 0) {
        reasons.push("Faktura ma alokacje na projekty.");
      }
      if (income.plannedPayments.length > 0) {
        reasons.push("Faktura ma zaplanowane wpłaty.");
      }
      if (income.payments.length > 0) {
        reasons.push("Faktura ma zarejestrowane wpłaty.");
      }
      if (income.payments.some((p) => p.bankTransactionId)) {
        reasons.push("Wpłata jest powiązana z transakcją bankową.");
      }
      if (income.payments.some((p) => p.projectAllocations.length > 0)) {
        reasons.push("Wpłata ma alokacje na projekty.");
      }
      if (reasons.length > 0) {
        return block(
          "Nie można cofnąć importu, bo faktura ma płatności lub powiązania. Usuń ręcznie albo najpierw usuń powiązania.",
          ...reasons,
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.incomeInvoice.delete({ where: { id: incomeId } });
        await tx.ksefDocument.update({
          where: { id: documentId },
          data: {
            importedAsRevenueInvoiceId: null,
            importedAt: null,
            workflowStatus: "NEW",
            processedAt: new Date(),
          },
        });
      });
    } else {
      await prisma.ksefDocument.update({
        where: { id: documentId },
        data: {
          importedAsRevenueInvoiceId: null,
          importedAt: null,
          workflowStatus: "NEW",
          processedAt: new Date(),
        },
      });
    }
  }

  await applyDuplicateScanToDocument(documentId);

  return { ok: true, ksefDocumentId: documentId };
}
