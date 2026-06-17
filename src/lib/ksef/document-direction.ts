import { getKsefConfig } from "./config";
import type { KsefDocumentDirection } from "./types";

export function normalizeNip(value: string): string {
  return value.replace(/\D/g, "");
}

export function classifyDocumentDirection(input: {
  sellerTaxId: string;
  buyerTaxId: string;
}): KsefDocumentDirection {
  const own = normalizeNip(getKsefConfig().companyTaxId);
  if (!own) return "UNKNOWN";
  const seller = normalizeNip(input.sellerTaxId);
  const buyer = normalizeNip(input.buyerTaxId);
  if (buyer === own && seller !== own) return "PURCHASE";
  if (seller === own && buyer !== own) return "SALE";
  return "UNKNOWN";
}
