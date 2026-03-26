import { Decimal } from "@prisma/client/runtime/library";

export function decToNumber(d: Decimal | string | number): number {
  if (typeof d === "number") return d;
  if (typeof d === "string") return Number(d);
  return Number(d.toString());
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
