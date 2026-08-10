import { account5FromPlaceKind, account5FromProjectCode, type CostPlaceKind } from "@/lib/accounting/account-codes";

export function inferCostPlaceKind(params: {
  costPlaceKind?: string | null;
  projectId?: string | null;
  allocationCount?: number;
}): CostPlaceKind {
  const raw = params.costPlaceKind?.trim();
  if (raw === "GENERAL_502" || raw === "MANAGEMENT_550" || raw === "PROJECT" || raw === "UNCLASSIFIED") {
    return raw;
  }
  if (params.projectId || (params.allocationCount ?? 0) > 0) return "PROJECT";
  return "UNCLASSIFIED";
}

/** Snapshot konta 5 do zapisu na CostInvoice. */
export async function resolveCostInvoiceAccount5Fields(params: {
  costPlaceKind: CostPlaceKind;
  projectId: string | null;
  allocationAccount5Codes?: (string | null | undefined)[];
  fetchProjectCode: (projectId: string) => Promise<string | null>;
}): Promise<{ costPlaceKind: CostPlaceKind; account5Code: string | null }> {
  const kind = params.costPlaceKind;
  if (kind === "GENERAL_502" || kind === "MANAGEMENT_550") {
    return { costPlaceKind: kind, account5Code: account5FromPlaceKind(kind) };
  }
  if (kind === "UNCLASSIFIED") {
    return { costPlaceKind: kind, account5Code: null };
  }
  let code: string | null = null;
  if (params.projectId) {
    code = account5FromProjectCode(await params.fetchProjectCode(params.projectId));
  }
  if (!code) {
    code = (params.allocationAccount5Codes ?? []).map((c) => c?.trim()).find(Boolean) ?? null;
  }
  return { costPlaceKind: "PROJECT", account5Code: code };
}
