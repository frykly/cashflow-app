import { Decimal } from "@prisma/client/runtime/library";
import type { VatRatePct } from "@/lib/vat-rate";

export type { VatRatePct } from "@/lib/vat-rate";
export { inferVatRateFromAmounts } from "@/lib/vat-rate";

export function grossFromNetVat(net: string | number, vat: string | number): Decimal {
  const n = new Decimal(net.toString());
  const v = new Decimal(vat.toString());
  return n.plus(v);
}

export function vatFromNetAndRate(net: string | number, rate: VatRatePct): Decimal {
  const n = new Decimal(net.toString());
  return n.mul(rate).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function grossFromNetAndRate(net: string | number, rate: VatRatePct): Decimal {
  return new Decimal(net.toString()).plus(vatFromNetAndRate(net, rate));
}
