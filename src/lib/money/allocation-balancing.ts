import { normalizeDecimalInput } from "@/lib/decimal-input";

export type AllocationVatRateCode = "23" | "8" | "5" | "0" | "ZW" | "NP" | "MANUAL";

export type AllocationAmountRow = {
  netAmount: string;
  grossAmount: string;
};

export type AllocationTotals = {
  documentNet: number;
  allocatedNet: number;
  remainingNet: number;
  documentGross: number;
  allocatedGross: number;
  remainingGross: number;
  netOver: boolean;
  grossOver: boolean;
  netOk: boolean;
  grossOk: boolean;
};

export const ALLOCATION_MONEY_EPS = 0.02;

export function parseMoneyString(raw: string | number | null | undefined): number {
  const normalized = normalizeDecimalInput(String(raw ?? "").trim());
  if (normalized === "") return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return 0;
  return roundMoney(value);
}

export function formatMoneyString(value: number): string {
  return roundMoney(value).toFixed(2);
}

export function isManualVatRate(code: AllocationVatRateCode): boolean {
  return code === "MANUAL";
}

function vatRateNumber(code: AllocationVatRateCode): number {
  if (code === "23") return 23;
  if (code === "8") return 8;
  if (code === "5") return 5;
  return 0;
}

export function allocationAmountsFromNet(
  netRaw: string,
  vatRateCode: AllocationVatRateCode,
): { netAmount: string; grossAmount: string } {
  const net = parseMoneyString(netRaw);
  const rate = vatRateNumber(vatRateCode);
  const vat = roundMoney((net * rate) / 100);
  return {
    netAmount: netRaw,
    grossAmount: formatMoneyString(net + vat),
  };
}

export function allocationAmountsFromGross(
  grossRaw: string,
  vatRateCode: AllocationVatRateCode,
): { netAmount: string; grossAmount: string } {
  const gross = parseMoneyString(grossRaw);
  const rate = vatRateNumber(vatRateCode);
  if (rate === 0) {
    return {
      netAmount: formatMoneyString(gross),
      grossAmount: grossRaw,
    };
  }
  const net = roundMoney(gross / (1 + rate / 100));
  return {
    netAmount: formatMoneyString(net),
    grossAmount: grossRaw,
  };
}

export function sumAllocations(rows: AllocationAmountRow[]): { net: number; gross: number } {
  return rows.reduce(
    (sum, row) => ({
      net: roundMoney(sum.net + parseMoneyString(row.netAmount)),
      gross: roundMoney(sum.gross + parseMoneyString(row.grossAmount)),
    }),
    { net: 0, gross: 0 },
  );
}

export function allocationTotals(params: {
  documentNet: string;
  documentGross: string;
  rows: AllocationAmountRow[];
}): AllocationTotals {
  const documentNet = parseMoneyString(params.documentNet);
  const documentGross = parseMoneyString(params.documentGross);
  const allocated = sumAllocations(params.rows);
  const remainingNet = roundMoney(documentNet - allocated.net);
  const remainingGross = roundMoney(documentGross - allocated.gross);
  return {
    documentNet,
    allocatedNet: allocated.net,
    remainingNet,
    documentGross,
    allocatedGross: allocated.gross,
    remainingGross,
    netOver: remainingNet < -ALLOCATION_MONEY_EPS,
    grossOver: remainingGross < -ALLOCATION_MONEY_EPS,
    netOk: Math.abs(remainingNet) <= ALLOCATION_MONEY_EPS,
    grossOk: Math.abs(remainingGross) <= ALLOCATION_MONEY_EPS,
  };
}

export function allocationRemainingForRow(params: {
  documentNet: string;
  documentGross: string;
  rows: AllocationAmountRow[];
  rowIndex: number;
}): { netAmount: string; grossAmount: string } {
  const otherRows = params.rows.filter((_, idx) => idx !== params.rowIndex);
  const totals = allocationTotals({
    documentNet: params.documentNet,
    documentGross: params.documentGross,
    rows: otherRows,
  });
  return {
    netAmount: formatMoneyString(Math.max(0, totals.remainingNet)),
    grossAmount: formatMoneyString(Math.max(0, totals.remainingGross)),
  };
}

export function fillAllocationRemainder(params: {
  documentNet: string;
  documentGross: string;
  rows: AllocationAmountRow[];
  rowIndex: number;
  vatRateCode: AllocationVatRateCode;
}): { netAmount: string; grossAmount: string } {
  const remaining = allocationRemainingForRow(params);
  if (isManualVatRate(params.vatRateCode)) return remaining;
  return allocationAmountsFromNet(remaining.netAmount, params.vatRateCode);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
