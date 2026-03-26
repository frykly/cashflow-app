import { Decimal } from "@prisma/client/runtime/library";
import { normalizeDecimalInput } from "@/lib/decimal-input";
import { grossFromNetAndRate, vatFromNetAndRate } from "@/lib/validation/gross";
import { isStoredVatOnlyCost } from "@/lib/validation/is-vat-only-cost";
import type { VatRatePct } from "@/lib/vat-rate";

export { isStoredVatOnlyCost };

export function resolveEffectiveVatOnly(
  data: { vatOnly?: boolean },
  existing: { netAmount: unknown; vatAmount: unknown },
): boolean {
  if (data.vatOnly === false) return false;
  if (data.vatOnly === true) return true;
  return isStoredVatOnlyCost(existing.netAmount, existing.vatAmount);
}

const NET_EPS = 0.0001;
const GROSS_VAT_EPS = 0.02;

export type ResolvedCostAmounts = {
  net: Decimal;
  vat: Decimal;
  gross: Decimal;
  /** Dla „tylko VAT” zapisujemy stawkę 0 — netto nie jest liczone od stawki. */
  storedVatRate: VatRatePct;
};

/**
 * Kwoty kosztu: tryb standardowy (netto + stawka) albo „tylko VAT” (netto 0, brutto = VAT).
 */
export function resolveCostInvoiceAmounts(params: {
  vatOnly: boolean;
  netAmount: string | number;
  vatAmount?: string | number;
  grossAmount?: string | number;
  vatRate: VatRatePct;
}): { ok: true; amounts: ResolvedCostAmounts } | { ok: false; message: string } {
  if (params.vatOnly) {
    const netN = Number(normalizeDecimalInput(String(params.netAmount)));
    if (Number.isFinite(netN) && Math.abs(netN) > NET_EPS) {
      return { ok: false, message: "Przy „Płatność tylko VAT” kwota netto musi być 0." };
    }
    if (params.vatAmount === undefined || params.grossAmount === undefined) {
      return { ok: false, message: "Podaj kwotę VAT i brutto (brutto = VAT)." };
    }
    const vatN = Number(normalizeDecimalInput(String(params.vatAmount)));
    const grossN = Number(normalizeDecimalInput(String(params.grossAmount)));
    if (!Number.isFinite(vatN) || vatN <= 0) {
      return { ok: false, message: "Kwota VAT musi być większa od 0." };
    }
    if (!Number.isFinite(grossN) || Math.abs(grossN - vatN) > GROSS_VAT_EPS) {
      return { ok: false, message: "Brutto musi równać się kwocie VAT." };
    }
    const v = new Decimal(vatN.toFixed(2));
    return {
      ok: true,
      amounts: {
        net: new Decimal(0),
        vat: v,
        gross: v,
        storedVatRate: 0,
      },
    };
  }

  const netN = Number(normalizeDecimalInput(String(params.netAmount)));
  if (!Number.isFinite(netN) || netN <= 0) {
    return { ok: false, message: "Podaj kwotę netto większą od 0 albo włącz „Płatność tylko VAT”." };
  }
  const rate = params.vatRate;
  const vat = vatFromNetAndRate(netN.toString(), rate);
  const gross = grossFromNetAndRate(netN.toString(), rate);
  return {
    ok: true,
    amounts: {
      net: new Decimal(netN.toString()),
      vat,
      gross,
      storedVatRate: rate,
    },
  };
}
