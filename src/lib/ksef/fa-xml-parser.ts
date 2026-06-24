import { XMLParser } from "fast-xml-parser";
import type { KsefInvoiceLinePreview, KsefPartyPreview, KsefSettlementLinePreview } from "./invoice-preview";
import type { VatBreakdownLine } from "./raw-payload-display";

export type FaXmlParsedInvoice = {
  invoiceNumber: string | null;
  issueDate: string | null;
  saleDate: string | null;
  paymentDueDate: string | null;
  currency: string | null;
  seller: KsefPartyPreview;
  buyer: KsefPartyPreview;
  netAmount: string | null;
  vatAmount: string | null;
  grossAmount: string | null;
  vatBreakdown: VatBreakdownLine[];
  lines: KsefInvoiceLinePreview[];
  settlementCharges: KsefSettlementLinePreview[];
  settlementDeductions: KsefSettlementLinePreview[];
  additionalChargesTotal: string | null;
  deductionsTotal: string | null;
  amountToPay: string | null;
  amountToSettle: string | null;
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
});

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") {
    const s = String(v).trim();
    return s || null;
  }
  const rec = asRecord(v);
  if (rec) {
    return textOf(rec["#text"] ?? rec._ ?? rec.value);
  }
  return null;
}

function fmtAmount(v: unknown): string | null {
  const t = textOf(v);
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return t;
  return n.toFixed(2);
}

function fmtDate(v: unknown): string | null {
  const t = textOf(v);
  if (!t) return null;
  return t.length >= 10 ? t.slice(0, 10) : t;
}

function formatAdres(adres: unknown): string | null {
  const rec = asRecord(adres);
  if (!rec) return null;
  const parts = [
    textOf(rec.AdresL1),
    textOf(rec.AdresL2),
    textOf(rec.AdresL3),
    textOf(rec.KodKraju) && textOf(rec.KodKraju) !== "PL" ? textOf(rec.KodKraju) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function extractParty(podmiot: unknown): KsefPartyPreview {
  const rec = asRecord(podmiot);
  if (!rec) {
    return { name: "—", taxId: null, address: null, bankAccount: null };
  }
  const dane = asRecord(rec.DaneIdentyfikacyjne);
  const nip = textOf(dane?.NIP ?? dane?.NrVatUE ?? rec.NIP);
  const name = textOf(dane?.Nazwa ?? rec.Nazwa) ?? "—";
  const address =
    formatAdres(rec.Adres) ??
    formatAdres(rec.AdresKoresp) ??
    formatAdres(rec.AdresPol);
  return { name, taxId: nip, address, bankAccount: null };
}

function extractBankAccounts(platnosc: unknown): string[] {
  const accounts: string[] = [];
  for (const p of asArray(platnosc)) {
    const rec = asRecord(p);
    if (!rec) continue;
    for (const rb of asArray(rec.RachunekBankowy)) {
      const row = asRecord(rb);
      const nr = textOf(row?.NrRB ?? row?.NrRachunkuBankowego);
      if (nr) accounts.push(nr);
    }
  }
  return accounts;
}

function extractPaymentDue(platnosc: unknown): string | null {
  for (const p of asArray(platnosc)) {
    const rec = asRecord(p);
    if (!rec) continue;
    const termin = fmtDate(rec.TerminPlatnosci ?? rec.Termin);
    if (termin) return termin;
    for (const tp of asArray(rec.TerminPlatnosci)) {
      const row = asRecord(tp);
      const d = fmtDate(row?.Termin ?? row?.TerminPlatnosci);
      if (d) return d;
    }
  }
  return null;
}

const VAT_RATE_ROWS: { netKey: string; vatKey: string; label: string }[] = [
  { netKey: "P_13_1", vatKey: "P_14_1", label: "23%" },
  { netKey: "P_13_2", vatKey: "P_14_2", label: "8%" },
  { netKey: "P_13_3", vatKey: "P_14_3", label: "5%" },
  { netKey: "P_13_4", vatKey: "P_14_4", label: "4%" },
  { netKey: "P_13_5", vatKey: "P_14_5", label: "inne" },
  { netKey: "P_13_6_1", vatKey: "P_14_6_1", label: "0%" },
  { netKey: "P_13_6_2", vatKey: "P_14_6_2", label: "0%" },
  { netKey: "P_13_7", vatKey: "P_14_7", label: "zw." },
];

function extractVatBreakdown(fa: Record<string, unknown>): VatBreakdownLine[] {
  const lines: VatBreakdownLine[] = [];
  for (const row of VAT_RATE_ROWS) {
    const net = fmtAmount(fa[row.netKey]);
    const vat = fmtAmount(fa[row.vatKey]);
    if (!net && !vat) continue;
    const netN = net ? Number(net) : 0;
    const vatN = vat ? Number(vat) : 0;
    if (Math.abs(netN) < 0.001 && Math.abs(vatN) < 0.001) continue;
    const gross = (netN + vatN).toFixed(2);
    lines.push({
      label: `Stawka ${row.label}`,
      rate: row.label.replace("%", "").replace("zw.", "zw"),
      netAmount: net ?? undefined,
      vatAmount: vat ?? undefined,
      grossAmount: gross,
    });
  }
  return lines;
}

function mapFaWiersz(row: Record<string, unknown>, index: number): KsefInvoiceLinePreview | null {
  const name = textOf(row.P_7 ?? row.P_7Z);
  if (!name) return null;
  const vatRaw = textOf(row.P_12);
  return {
    lineNumber: index + 1,
    name,
    quantity: textOf(row.P_8B),
    unit: textOf(row.P_8A),
    unitNetPrice: fmtAmount(row.P_9A ?? row.P_9B),
    vatRate: vatRaw ? (vatRaw.includes("%") ? vatRaw : `${vatRaw}%`) : null,
    netAmount: fmtAmount(row.P_11 ?? row.P_11A),
    vatAmount: fmtAmount(row.P_11Vat ?? row.P_13),
    grossAmount: fmtAmount(row.P_11Brutto ?? row.P_14),
  };
}

function extractLines(fa: Record<string, unknown>): KsefInvoiceLinePreview[] {
  const lines: KsefInvoiceLinePreview[] = [];
  for (const w of asArray(fa.FaWiersz)) {
    const rec = asRecord(w);
    if (!rec) continue;
    const mapped = mapFaWiersz(rec, lines.length);
    if (mapped) lines.push(mapped);
  }
  return lines;
}

function sumVatFromBreakdown(breakdown: VatBreakdownLine[]): string | null {
  let total = 0;
  let any = false;
  for (const row of breakdown) {
    if (row.vatAmount) {
      total += Number(row.vatAmount);
      any = true;
    }
  }
  return any ? total.toFixed(2) : null;
}

function sumNetFromBreakdown(breakdown: VatBreakdownLine[]): string | null {
  let total = 0;
  let any = false;
  for (const row of breakdown) {
    if (row.netAmount) {
      total += Number(row.netAmount);
      any = true;
    }
  }
  return any ? total.toFixed(2) : null;
}

function sumSettlementLines(lines: KsefSettlementLinePreview[]): string | null {
  let total = 0;
  let any = false;
  for (const line of lines) {
    total += Number(line.amount);
    any = true;
  }
  return any ? total.toFixed(2) : null;
}

function extractSettlementLines(
  items: unknown,
  defaultDescription: string,
): KsefSettlementLinePreview[] {
  const lines: KsefSettlementLinePreview[] = [];
  for (const item of asArray(items)) {
    const rec = asRecord(item);
    if (!rec) continue;
    const amount = fmtAmount(rec.Kwota);
    if (!amount || Number(amount) === 0) continue;
    lines.push({
      description: textOf(rec.Powod) ?? defaultDescription,
      amount,
    });
  }
  return lines;
}

function extractSettlement(
  fa: Record<string, unknown>,
  grossAmount: string | null,
): Pick<
  FaXmlParsedInvoice,
  | "settlementCharges"
  | "settlementDeductions"
  | "additionalChargesTotal"
  | "deductionsTotal"
  | "amountToPay"
  | "amountToSettle"
> {
  const rozliczenie = asRecord(fa.Rozliczenie);
  if (!rozliczenie) {
    return {
      settlementCharges: [],
      settlementDeductions: [],
      additionalChargesTotal: null,
      deductionsTotal: null,
      amountToPay: null,
      amountToSettle: null,
    };
  }

  const settlementCharges = extractSettlementLines(rozliczenie.Obciazenia, "Obciążenie");
  const settlementDeductions = extractSettlementLines(rozliczenie.Odliczenia, "Odliczenie");
  const additionalChargesTotal =
    fmtAmount(rozliczenie.SumaObciazen) ?? sumSettlementLines(settlementCharges);
  const deductionsTotal =
    fmtAmount(rozliczenie.SumaOdliczen) ?? sumSettlementLines(settlementDeductions);
  const amountToSettle = fmtAmount(rozliczenie.DoRozliczenia);

  let amountToPay = fmtAmount(rozliczenie.DoZaplaty);
  if (!amountToPay && grossAmount) {
    const gross = Number(grossAmount);
    const charges = additionalChargesTotal ? Number(additionalChargesTotal) : 0;
    const deductions = deductionsTotal ? Number(deductionsTotal) : 0;
    if (charges > 0 || deductions > 0) {
      amountToPay = (gross + charges - deductions).toFixed(2);
    }
  }

  return {
    settlementCharges,
    settlementDeductions,
    additionalChargesTotal,
    deductionsTotal,
    amountToPay,
    amountToSettle,
  };
}

function findFakturaRoot(parsed: unknown): Record<string, unknown> | null {
  const rec = asRecord(parsed);
  if (!rec) return null;
  if (rec.Faktura) return asRecord(rec.Faktura) ?? rec;
  if (rec.Fa || rec.Podmiot1) return rec;
  return rec;
}

/**
 * Parsuje XML faktury FA(2)/FA(3) zwrócony przez KSeF GET /invoices/ksef/{ksefNumber}.
 */
export function parseFaInvoiceXml(xml: string): FaXmlParsedInvoice {
  const parsed = xmlParser.parse(xml);
  const faktura = findFakturaRoot(parsed);
  if (!faktura) {
    throw new Error("Nie rozpoznano struktury XML faktury (brak elementu Faktura).");
  }

  const fa = asRecord(faktura.Fa) ?? {};
  const seller = extractParty(faktura.Podmiot1);
  const buyer = extractParty(faktura.Podmiot2);
  const bankAccounts = extractBankAccounts(faktura.Platnosc ?? fa.Platnosc);
  if (bankAccounts[0]) {
    seller.bankAccount = bankAccounts[0];
  }

  const vatBreakdown = extractVatBreakdown(fa);
  const grossAmount = fmtAmount(fa.P_15);
  const netAmount = fmtAmount(fa.P_13_6) ?? sumNetFromBreakdown(vatBreakdown);
  const vatAmount = fmtAmount(fa.P_14_6) ?? sumVatFromBreakdown(vatBreakdown);

  const invoiceNumber =
    textOf(fa.P_2) ??
    textOf(faktura.P_2) ??
    textOf(asRecord(faktura.Naglowek)?.P_2);

  const settlement = extractSettlement(fa, grossAmount);

  return {
    invoiceNumber,
    issueDate: fmtDate(fa.P_1),
    saleDate: fmtDate(fa.P_6),
    paymentDueDate: extractPaymentDue(faktura.Platnosc ?? fa.Platnosc),
    currency: textOf(fa.KodWaluty) ?? "PLN",
    seller,
    buyer,
    netAmount,
    vatAmount,
    grossAmount,
    vatBreakdown,
    lines: extractLines(fa),
    ...settlement,
  };
}
