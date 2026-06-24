import type { KsefDocument } from "@prisma/client";
import { parseFaInvoiceXml } from "./fa-xml-parser";
import {
  extractVatBreakdownFromRawPayload,
  parseRawPayloadJson,
  type VatBreakdownLine,
} from "./raw-payload-display";

export type { VatBreakdownLine };

export type KsefPartyPreview = {
  name: string;
  taxId: string | null;
  address: string | null;
  bankAccount: string | null;
};

export type KsefInvoiceLinePreview = {
  lineNumber: number | null;
  name: string;
  quantity: string | null;
  unit: string | null;
  unitNetPrice: string | null;
  vatRate: string | null;
  netAmount: string | null;
  vatAmount: string | null;
  grossAmount: string | null;
};

export type KsefSettlementLinePreview = {
  description: string;
  amount: string;
};

export type KsefInvoicePreview = {
  invoiceNumber: string;
  ksefId: string;
  documentType: string;
  direction: "PURCHASE" | "SALE" | "UNKNOWN";
  directionLabel: string;
  workflowStatus: string;
  workflowStatusLabel: string;
  issueDate: string | null;
  saleDate: string | null;
  ksefReceivedDate: string | null;
  paymentDueDate: string | null;
  currency: string;
  seller: KsefPartyPreview;
  buyer: KsefPartyPreview;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  vatBreakdown: VatBreakdownLine[];
  lines: KsefInvoiceLinePreview[];
  /** Kwota należności ogółem z faktury (P_15) — bez obciążeń rozliczenia */
  invoiceGrossAmount: string;
  settlementCharges: KsefSettlementLinePreview[];
  settlementDeductions: KsefSettlementLinePreview[];
  additionalChargesTotal: string | null;
  deductionsTotal: string | null;
  /** Kwota do zapłaty po rozliczeniu (DoZaplaty lub P_15 + obciążenia − odliczenia) */
  amountToPay: string | null;
  amountToSettle: string | null;
  /** metadata = tylko zapytanie metadata; xml = pełna faktura z cache XML */
  previewSource: "metadata" | "xml";
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function fmtNum(n: unknown): string | null {
  if (typeof n === "number" && !Number.isNaN(n)) return n.toFixed(2);
  if (typeof n === "string" && n.trim()) return n.trim();
  return null;
}

function fmtQty(n: unknown): string | null {
  if (typeof n === "number" && !Number.isNaN(n)) return String(n);
  if (typeof n === "string" && n.trim()) return n.trim();
  return null;
}

function previewDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  if (!s) return null;
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function formatAddress(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  const rec = asRecord(value);
  if (!rec) return null;

  const parts = [
    firstString(rec.addressLine1, rec.line1, rec.street, rec.streetName),
    firstString(rec.addressLine2, rec.line2),
    [firstString(rec.postalCode, rec.zipCode), firstString(rec.city, rec.town)]
      .filter(Boolean)
      .join(" "),
    firstString(rec.country, rec.countryCode),
  ].filter((p): p is string => Boolean(p && p.trim()));

  return parts.length > 0 ? parts.join(", ") : null;
}

function extractPartyAddress(party: Record<string, unknown> | null): string | null {
  if (!party) return null;
  return (
    formatAddress(party.address) ??
    formatAddress(party.registeredAddress) ??
    formatAddress(party.correspondenceAddress) ??
    firstString(party.addressLine1, party.fullAddress)
  );
}

function extractBankAccount(root: Record<string, unknown>, party: Record<string, unknown> | null): string | null {
  const fromParty = party
    ? firstString(
        party.bankAccount,
        party.bankAccountNumber,
        party.accountNumber,
        party.iban,
      )
    : null;
  if (fromParty) return fromParty;

  const paymentMeans = root.paymentMeans;
  if (Array.isArray(paymentMeans)) {
    for (const item of paymentMeans) {
      const row = asRecord(item);
      if (!row) continue;
      const acc = firstString(row.bankAccount, row.accountNumber, row.iban, row.number);
      if (acc) return acc;
    }
  }

  const pm = asRecord(paymentMeans);
  if (pm) {
    return firstString(pm.bankAccount, pm.accountNumber, pm.iban, pm.number);
  }

  return firstString(
    root.sellerBankAccount,
    root.bankAccount,
    root.bankAccountNumber,
    root.iban,
  );
}

function extractSellerParty(
  doc: Pick<KsefDocument, "sellerName" | "sellerTaxId">,
  root: Record<string, unknown> | null,
): KsefPartyPreview {
  const seller = root ? asRecord(root.seller) : null;
  return {
    name: doc.sellerName.trim() || firstString(seller?.name) || "—",
    taxId: doc.sellerTaxId.trim() || firstString(seller?.nip, seller?.taxId) || null,
    address: extractPartyAddress(seller),
    bankAccount: root ? extractBankAccount(root, seller) : null,
  };
}

function extractBuyerParty(
  doc: Pick<KsefDocument, "buyerName" | "buyerTaxId">,
  root: Record<string, unknown> | null,
): KsefPartyPreview {
  const buyer = root ? asRecord(root.buyer) : null;
  const buyerId = buyer ? asRecord(buyer.identifier) : null;
  return {
    name: doc.buyerName.trim() || firstString(buyer?.name) || "—",
    taxId:
      doc.buyerTaxId.trim() ||
      firstString(buyerId?.value, buyer?.nip, buyer?.taxId) ||
      null,
    address: extractPartyAddress(buyer),
    bankAccount: null,
  };
}

const LINE_ARRAY_KEYS = [
  "invoiceLines",
  "lines",
  "lineItems",
  "invoiceItems",
  "positions",
  "items",
  "invoiceLineItems",
];

function mapLineItem(row: Record<string, unknown>, index: number): KsefInvoiceLinePreview | null {
  const name =
    firstString(
      row.name,
      row.description,
      row.itemName,
      row.productName,
      row.goodsName,
      row.serviceName,
    ) ?? "";
  if (!name) return null;

  const lineNumberRaw = row.lineNumber ?? row.lp ?? row.ordinalNumber ?? row.lineNo ?? index + 1;
  const lineNumber =
    typeof lineNumberRaw === "number"
      ? lineNumberRaw
      : typeof lineNumberRaw === "string" && /^\d+$/.test(lineNumberRaw)
        ? Number(lineNumberRaw)
        : index + 1;

  const vatRate =
    fmtNum(row.vatRate) ??
    (typeof row.vatRate === "string" ? row.vatRate : null) ??
    fmtNum(row.taxRate);

  return {
    lineNumber,
    name,
    quantity: fmtQty(row.quantity ?? row.qty ?? row.amount),
    unit: firstString(row.unit, row.unitOfMeasure, row.uom),
    unitNetPrice: fmtNum(row.unitNetPrice ?? row.netUnitPrice ?? row.unitPrice ?? row.price),
    vatRate: vatRate ? (vatRate.includes("%") ? vatRate : `${vatRate}%`) : null,
    netAmount: fmtNum(row.netAmount ?? row.net),
    vatAmount: fmtNum(row.vatAmount ?? row.vat ?? row.taxAmount),
    grossAmount: fmtNum(row.grossAmount ?? row.gross),
  };
}

export function extractInvoiceLinesFromRawPayload(rawPayload: string): KsefInvoiceLinePreview[] {
  const root = asRecord(parseRawPayloadJson(rawPayload));
  if (!root) return [];

  for (const key of LINE_ARRAY_KEYS) {
    const arr = root[key];
    if (!Array.isArray(arr)) continue;
    const lines: KsefInvoiceLinePreview[] = [];
    for (let i = 0; i < arr.length; i++) {
      const row = asRecord(arr[i]);
      if (!row) continue;
      const mapped = mapLineItem(row, i);
      if (mapped) lines.push(mapped);
    }
    if (lines.length > 0) return lines;
  }

  return [];
}

function directionLabel(direction: string): string {
  if (direction === "PURCHASE") return "Zakup";
  if (direction === "SALE") return "Sprzedaż";
  return "Nieznane";
}

function workflowStatusLabel(status: string): string {
  if (status === "NEW") return "Nowy";
  if (status === "PROBABLE_DUPLICATE") return "Już w systemie";
  if (status === "IMPORTED") return "Zaimportowany";
  if (status === "REJECTED") return "Odrzucony";
  return status;
}

function ksefReceivedDate(
  doc: Pick<KsefDocument, "createdAt">,
  root: Record<string, unknown> | null,
): string | null {
  return (
    previewDate(firstString(root?.permanentStorageDate, root?.acquisitionDate)) ??
    previewDate(doc.createdAt)
  );
}

export function buildKsefInvoicePreview(
  doc: Pick<
    KsefDocument,
    | "ksefId"
    | "invoiceNumber"
    | "documentType"
    | "documentDirection"
    | "workflowStatus"
    | "issueDate"
    | "saleDate"
    | "paymentDueDate"
    | "sellerName"
    | "sellerTaxId"
    | "buyerName"
    | "buyerTaxId"
    | "netAmount"
    | "vatAmount"
    | "grossAmount"
    | "currency"
    | "rawPayload"
    | "createdAt"
    | "xmlPayload"
    | "xmlFetchStatus"
  >,
): KsefInvoicePreview {
  const root = asRecord(parseRawPayloadJson(doc.rawPayload));
  const saleFromPayload = previewDate(firstString(root?.invoicingDate, root?.saleDate));

  const base: KsefInvoicePreview = {
    invoiceNumber: doc.invoiceNumber.trim() || "—",
    ksefId: doc.ksefId,
    documentType: doc.documentType,
    direction: doc.documentDirection as KsefInvoicePreview["direction"],
    directionLabel: directionLabel(doc.documentDirection),
    workflowStatus: doc.workflowStatus,
    workflowStatusLabel: workflowStatusLabel(doc.workflowStatus),
    issueDate: previewDate(doc.issueDate),
    saleDate: previewDate(doc.saleDate) ?? saleFromPayload,
    ksefReceivedDate: ksefReceivedDate(doc, root),
    paymentDueDate:
      previewDate(doc.paymentDueDate) ?? previewDate(firstString(root?.paymentDate)),
    currency: doc.currency || firstString(root?.currency) || "PLN",
    seller: extractSellerParty(doc, root),
    buyer: extractBuyerParty(doc, root),
    netAmount: doc.netAmount.toString(),
    vatAmount: doc.vatAmount.toString(),
    grossAmount: doc.grossAmount.toString(),
    vatBreakdown: extractVatBreakdownFromRawPayload(doc.rawPayload),
    lines: extractInvoiceLinesFromRawPayload(doc.rawPayload),
    invoiceGrossAmount: doc.grossAmount.toString(),
    settlementCharges: [],
    settlementDeductions: [],
    additionalChargesTotal: null,
    deductionsTotal: null,
    amountToPay: null,
    amountToSettle: null,
    previewSource: "metadata",
  };

  if (doc.xmlFetchStatus === "OK" && doc.xmlPayload?.trim()) {
    try {
      const xml = parseFaInvoiceXml(doc.xmlPayload);
      return {
        ...base,
        previewSource: "xml",
        invoiceNumber: xml.invoiceNumber ?? base.invoiceNumber,
        issueDate: xml.issueDate ?? base.issueDate,
        saleDate: xml.saleDate ?? base.saleDate,
        paymentDueDate: xml.paymentDueDate ?? base.paymentDueDate,
        currency: xml.currency ?? base.currency,
        seller: {
          name: xml.seller.name || base.seller.name,
          taxId: xml.seller.taxId ?? base.seller.taxId,
          address: xml.seller.address ?? base.seller.address,
          bankAccount: xml.seller.bankAccount ?? base.seller.bankAccount,
        },
        buyer: {
          name: xml.buyer.name || base.buyer.name,
          taxId: xml.buyer.taxId ?? base.buyer.taxId,
          address: xml.buyer.address ?? base.buyer.address,
          bankAccount: xml.buyer.bankAccount,
        },
        netAmount: xml.netAmount ?? base.netAmount,
        vatAmount: xml.vatAmount ?? base.vatAmount,
        grossAmount: xml.grossAmount ?? base.grossAmount,
        invoiceGrossAmount: xml.grossAmount ?? base.grossAmount,
        vatBreakdown: xml.vatBreakdown.length > 0 ? xml.vatBreakdown : base.vatBreakdown,
        lines: xml.lines.length > 0 ? xml.lines : base.lines,
        settlementCharges: xml.settlementCharges,
        settlementDeductions: xml.settlementDeductions,
        additionalChargesTotal: xml.additionalChargesTotal,
        deductionsTotal: xml.deductionsTotal,
        amountToPay: xml.amountToPay,
        amountToSettle: xml.amountToSettle,
      };
    } catch {
      return base;
    }
  }

  return base;
}
