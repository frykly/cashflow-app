import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decToNumber } from "@/lib/cashflow/money";
import { normalizeNip } from "./document-direction";

const AMOUNT_EPS = 0.02;
const ISSUE_DATE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export type ProbableCostDuplicate = {
  id: string;
  documentNumber: string;
  supplier: string;
  grossAmount: string;
  summary: string;
};

export type ProbableIncomeDuplicate = {
  id: string;
  invoiceNumber: string;
  contractor: string;
  grossAmount: string;
  summary: string;
};

function normalizeDocNumber(value: string): string {
  return value.trim().toLowerCase();
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_EPS;
}

function issueDatesRoughlyMatch(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= ISSUE_DATE_TOLERANCE_MS;
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

function buyerMatchesContractor(
  incomeContractor: string,
  buyerName: string,
  contractorNames: string[],
): boolean {
  const con = incomeContractor.trim().toLowerCase();
  if (!con) return false;
  if (buyerName.trim().toLowerCase() === con) return true;
  return contractorNames.some((n) => n.trim().toLowerCase() === con);
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

/**
 * invoiceNumber + buyerTaxId/buyerName + grossAmount; issueDate pomocniczo przy wielu kandydatach.
 */
export async function findProbableIncomeDuplicate(input: {
  invoiceNumber: string;
  buyerTaxId: string;
  buyerName: string;
  grossAmount: Prisma.Decimal | string | number;
  issueDate: Date;
}): Promise<ProbableIncomeDuplicate | null> {
  const invoiceNumber = input.invoiceNumber.trim();
  if (!invoiceNumber) return null;

  const buyerTaxId = normalizeNip(input.buyerTaxId);
  const targetGross = decToNumber(input.grossAmount);
  const invNorm = normalizeDocNumber(invoiceNumber);

  const contractor = buyerTaxId
    ? await prisma.contractor.findFirst({
        where: { taxId: buyerTaxId },
        include: { aliases: true },
      })
    : null;
  const contractorNames = contractor
    ? [contractor.displayName, ...contractor.aliases.map((a) => a.aliasName)]
    : [input.buyerName];

  const incomes = await prisma.incomeInvoice.findMany({
    where: { invoiceNumber },
    select: {
      id: true,
      invoiceNumber: true,
      contractor: true,
      grossAmount: true,
      issueDate: true,
    },
  });

  const candidates = incomes.length
    ? incomes
    : await prisma.incomeInvoice.findMany({
        select: {
          id: true,
          invoiceNumber: true,
          contractor: true,
          grossAmount: true,
          issueDate: true,
        },
      });

  const matches: ProbableIncomeDuplicate[] = [];

  for (const inv of candidates) {
    if (normalizeDocNumber(inv.invoiceNumber) !== invNorm) continue;
    if (!amountsMatch(decToNumber(inv.grossAmount), targetGross)) continue;
    if (!buyerMatchesContractor(inv.contractor, input.buyerName, contractorNames)) continue;

    matches.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      contractor: inv.contractor,
      grossAmount: inv.grossAmount.toString(),
      summary: `${inv.invoiceNumber} · ${inv.contractor} · ${inv.grossAmount.toString()} PLN`,
    });
  }

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  const withDate = candidates.filter((c) =>
    matches.some((m) => m.id === c.id && issueDatesRoughlyMatch(c.issueDate, input.issueDate)),
  );
  const pick = withDate[0] ?? candidates.find((c) => matches.some((m) => m.id === c.id));
  if (!pick) return matches[0]!;

  return (
    matches.find((m) => m.id === pick.id) ?? matches[0]!
  );
}

async function clearDuplicateState(documentId: string): Promise<void> {
  await prisma.ksefDocument.update({
    where: { id: documentId },
    data: {
      workflowStatus: "NEW",
      duplicateOfCostInvoiceId: null,
      duplicateOfIncomeInvoiceId: null,
      duplicateMatchSummary: null,
    },
  });
}

export async function applyDuplicateScanToDocument(documentId: string): Promise<void> {
  const doc = await prisma.ksefDocument.findUnique({ where: { id: documentId } });
  if (!doc) return;
  if (doc.workflowStatus === "IMPORTED" || doc.workflowStatus === "REJECTED") return;

  if (doc.documentDirection === "PURCHASE") {
    const match = await findProbableCostDuplicate({
      invoiceNumber: doc.invoiceNumber,
      sellerTaxId: doc.sellerTaxId,
      sellerName: doc.sellerName,
      grossAmount: doc.grossAmount,
    });

    if (!match) {
      if (doc.workflowStatus === "PROBABLE_DUPLICATE") {
        await clearDuplicateState(documentId);
      }
      return;
    }

    await prisma.ksefDocument.update({
      where: { id: documentId },
      data: {
        workflowStatus: "PROBABLE_DUPLICATE",
        duplicateOfCostInvoiceId: match.id,
        duplicateOfIncomeInvoiceId: null,
        duplicateMatchSummary: match.summary,
      },
    });
    return;
  }

  if (doc.documentDirection === "SALE") {
    const match = await findProbableIncomeDuplicate({
      invoiceNumber: doc.invoiceNumber,
      buyerTaxId: doc.buyerTaxId,
      buyerName: doc.buyerName,
      grossAmount: doc.grossAmount,
      issueDate: doc.issueDate,
    });

    if (!match) {
      if (doc.workflowStatus === "PROBABLE_DUPLICATE") {
        await clearDuplicateState(documentId);
      }
      return;
    }

    await prisma.ksefDocument.update({
      where: { id: documentId },
      data: {
        workflowStatus: "PROBABLE_DUPLICATE",
        duplicateOfIncomeInvoiceId: match.id,
        duplicateOfCostInvoiceId: null,
        duplicateMatchSummary: match.summary,
      },
    });
    return;
  }

  if (doc.workflowStatus === "PROBABLE_DUPLICATE") {
    await clearDuplicateState(documentId);
  }
}
