import type { KsefDocument } from "@prisma/client";
import { parseFaInvoiceXml } from "./fa-xml-parser";

export type KsefDocumentPaymentDatePick = Pick<
  KsefDocument,
  "issueDate" | "paymentDueDate" | "xmlFetchStatus" | "xmlPayload"
>;

/** YYYY-MM-DD → Date (południe UTC, jak w formularzach). */
export function ksefDayKeyToDate(dayKey: string, fallback: Date): Date {
  const t = dayKey.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return new Date(`${t}T12:00:00.000Z`);
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/**
 * Termin płatności KSeF: pełny XML → metadane dokumentu → data wystawienia.
 * Zwraca klucz YYYY-MM-DD (do UI) lub null.
 */
export function resolveKsefPaymentDueDayKey(doc: KsefDocumentPaymentDatePick): string | null {
  if (doc.xmlFetchStatus === "OK" && doc.xmlPayload?.trim()) {
    try {
      const xml = parseFaInvoiceXml(doc.xmlPayload);
      if (xml.paymentDueDate) return xml.paymentDueDate;
    } catch {
      // metadata fallback
    }
  }

  if (doc.paymentDueDate) {
    const iso = doc.paymentDueDate.toISOString();
    return iso.length >= 10 ? iso.slice(0, 10) : null;
  }

  const issueIso = doc.issueDate.toISOString();
  return issueIso.length >= 10 ? issueIso.slice(0, 10) : null;
}

export function resolveKsefPaymentDueDate(doc: KsefDocumentPaymentDatePick): Date {
  const dayKey = resolveKsefPaymentDueDayKey(doc);
  if (dayKey) return ksefDayKeyToDate(dayKey, doc.issueDate);
  return doc.issueDate;
}

/** Domyślna planowana data zapłaty/wpływu przy imporcie. */
export function resolveKsefDefaultPlannedDate(
  doc: KsefDocumentPaymentDatePick,
  overrideIso?: string | null,
): Date {
  if (overrideIso?.trim()) {
    const d = new Date(overrideIso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return resolveKsefPaymentDueDate(doc);
}
