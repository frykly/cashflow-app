import { prisma } from "@/lib/db";
import { applyDuplicateScanToDocument } from "./duplicate-match";
import { classifyDocumentDirection } from "./document-direction";

export function invoiceNumberFromRawPayload(rawPayload: string): string {
  try {
    const j = JSON.parse(rawPayload) as { invoiceNumber?: string };
    const n = j.invoiceNumber;
    return typeof n === "string" ? n.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Przelicza documentDirection (i invoiceNumber z rawPayload) dla dokumentów,
 * które nie są zamknięte workflow (IMPORTED / REJECTED).
 */
export async function reclassifyExistingKsefDocuments(): Promise<number> {
  const docs = await prisma.ksefDocument.findMany({
    where: {
      workflowStatus: { in: ["NEW", "PROBABLE_DUPLICATE"] },
    },
  });

  let count = 0;
  for (const doc of docs) {
    const documentDirection = classifyDocumentDirection({
      sellerTaxId: doc.sellerTaxId,
      buyerTaxId: doc.buyerTaxId,
    });
    const parsedNumber = invoiceNumberFromRawPayload(doc.rawPayload);
    const invoiceNumber = doc.invoiceNumber.trim() || parsedNumber;

    await prisma.ksefDocument.update({
      where: { id: doc.id },
      data: {
        documentDirection,
        ...(invoiceNumber ? { invoiceNumber } : {}),
      },
    });
    await applyDuplicateScanToDocument(doc.id);
    count += 1;
  }

  return count;
}
