import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import { normalizeNip } from "./document-direction";

const AMOUNT_EPS = 0.02;

export type ProbableCostDuplicate = {
  id: string;
  documentNumber: string;
  supplier: string;
  grossAmount: string;
  summary: string;
};

function normalizeDocNumber(value: string): string {
  return value.trim().toLowerCase();
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_EPS;
}

function supplierMatchesSeller(
  costSupplier: string,
  sellerName: string,
  contractorNames: string[],
): boolean {
  const sup = costSupplier.trim().toLowerCase();
  if (!sup) return false;
  if (sellerName.trim().toLowerCase() === sup) return true;
  return contractorNames.some((n) => n.trim().toLowerCase() === sup);
}

/**
 * MVP: invoiceNumber + sellerTaxId + grossAmount.
 * Dopasowanie kontrahenta po NIP (Contractor.taxId) + nazwa dostawcy.
 */
export async function findProbableCostDuplicate(input: {
  invoiceNumber: string;
  sellerTaxId: string;
  sellerName: string;
  grossAmount: Prisma.Decimal | string | number;
}): Promise<ProbableCostDuplicate | null> {
  const invoiceNumber = input.invoiceNumber.trim();
  const sellerTaxId = normalizeNip(input.sellerTaxId);
  if (!invoiceNumber || !sellerTaxId) return null;

  const targetGross = decToNumber(input.grossAmount);
  const invNorm = normalizeDocNumber(invoiceNumber);

  const contractor = await prisma.contractor.findFirst({
    where: { taxId: sellerTaxId },
    include: { aliases: true },
  });
  const contractorNames = contractor
    ? [contractor.displayName, ...contractor.aliases.map((a) => a.aliasName)]
    : [input.sellerName];

  const costs = await prisma.costInvoice.findMany({
    where: { documentNumber: invoiceNumber },
    select: {
      id: true,
      documentNumber: true,
      supplier: true,
      grossAmount: true,
    },
  });

  const candidates = costs.length
    ? costs
    : await prisma.costInvoice.findMany({
        select: {
          id: true,
          documentNumber: true,
          supplier: true,
          grossAmount: true,
        },
      });

  for (const c of candidates) {
    if (normalizeDocNumber(c.documentNumber) !== invNorm) continue;
    if (!amountsMatch(decToNumber(c.grossAmount), targetGross)) continue;
    if (!supplierMatchesSeller(c.supplier, input.sellerName, contractorNames)) continue;

    return {
      id: c.id,
      documentNumber: c.documentNumber,
      supplier: c.supplier,
      grossAmount: c.grossAmount.toString(),
      summary: `${c.documentNumber} · ${c.supplier} · ${c.grossAmount.toString()} PLN`,
    };
  }

  return null;
}

export async function applyDuplicateScanToDocument(documentId: string): Promise<void> {
  const doc = await prisma.ksefDocument.findUnique({ where: { id: documentId } });
  if (!doc) return;
  if (doc.workflowStatus === "IMPORTED" || doc.workflowStatus === "REJECTED") return;
  if (doc.documentDirection !== "PURCHASE") return;

  const match = await findProbableCostDuplicate({
    invoiceNumber: doc.invoiceNumber,
    sellerTaxId: doc.sellerTaxId,
    sellerName: doc.sellerName,
    grossAmount: doc.grossAmount,
  });

  if (!match) {
    if (doc.workflowStatus === "PROBABLE_DUPLICATE") {
      await prisma.ksefDocument.update({
        where: { id: documentId },
        data: {
          workflowStatus: "NEW",
          duplicateOfCostInvoiceId: null,
          duplicateMatchSummary: null,
        },
      });
    }
    return;
  }

  await prisma.ksefDocument.update({
    where: { id: documentId },
    data: {
      workflowStatus: "PROBABLE_DUPLICATE",
      duplicateOfCostInvoiceId: match.id,
      duplicateMatchSummary: match.summary,
    },
  });
}
