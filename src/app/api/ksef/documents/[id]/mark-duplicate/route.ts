import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import {
  findProbableCostDuplicate,
  findProbableIncomeDuplicate,
} from "@/lib/ksef/duplicate-match";
import { ksefDocumentToPublicRow } from "@/lib/ksef/document-public-row";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const doc = await prisma.ksefDocument.findUnique({ where: { id } });
    if (!doc) return jsonError("Nie znaleziono dokumentu KSeF.", 404);
    if (doc.workflowStatus === "IMPORTED") {
      return jsonError("Zaimportowany dokument nie może być oznaczony jako już w systemie.", 400);
    }

    if (doc.documentDirection === "PURCHASE") {
      const match = doc.duplicateOfCostInvoiceId
        ? {
            id: doc.duplicateOfCostInvoiceId,
            summary: doc.duplicateMatchSummary ?? "",
          }
        : await findProbableCostDuplicate({
            invoiceNumber: doc.invoiceNumber,
            sellerTaxId: doc.sellerTaxId,
            sellerName: doc.sellerName,
            grossAmount: doc.grossAmount,
          });

      const summary = match?.summary
        ? match.summary
        : doc.duplicateMatchSummary ?? "Oznaczono ręcznie jako już w systemie";

      const updated = await prisma.ksefDocument.update({
        where: { id },
        data: {
          workflowStatus: "PROBABLE_DUPLICATE",
          duplicateOfCostInvoiceId: match?.id ?? doc.duplicateOfCostInvoiceId ?? null,
          duplicateOfIncomeInvoiceId: null,
          duplicateMatchSummary: summary,
          processedAt: new Date(),
        },
      });

      return jsonData(ksefDocumentToPublicRow(updated));
    }

    if (doc.documentDirection === "SALE") {
      const match = doc.duplicateOfIncomeInvoiceId
        ? {
            id: doc.duplicateOfIncomeInvoiceId,
            summary: doc.duplicateMatchSummary ?? "",
          }
        : await findProbableIncomeDuplicate({
            invoiceNumber: doc.invoiceNumber,
            buyerTaxId: doc.buyerTaxId,
            buyerName: doc.buyerName,
            grossAmount: doc.grossAmount,
            issueDate: doc.issueDate,
          });

      const summary = match?.summary
        ? match.summary
        : doc.duplicateMatchSummary ?? "Oznaczono ręcznie jako już w systemie";

      const updated = await prisma.ksefDocument.update({
        where: { id },
        data: {
          workflowStatus: "PROBABLE_DUPLICATE",
          duplicateOfIncomeInvoiceId: match?.id ?? doc.duplicateOfIncomeInvoiceId ?? null,
          duplicateOfCostInvoiceId: null,
          duplicateMatchSummary: summary,
          processedAt: new Date(),
        },
      });

      return jsonData(ksefDocumentToPublicRow(updated));
    }

    const updated = await prisma.ksefDocument.update({
      where: { id },
      data: {
        workflowStatus: "PROBABLE_DUPLICATE",
        duplicateMatchSummary: doc.duplicateMatchSummary ?? "Oznaczono ręcznie jako już w systemie",
        processedAt: new Date(),
      },
    });

    return jsonData(ksefDocumentToPublicRow(updated));
  } catch (e) {
    console.error("[ksef/mark-duplicate]", e);
    return jsonError(
      e instanceof Error ? e.message : "Nie udało się oznaczyć dokumentu jako już w systemie.",
      500,
    );
  }
}
