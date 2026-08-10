import { account5FromPlaceKind, account5FromProjectCode } from "@/lib/accounting/account-codes";
import { formatMoney } from "@/lib/format";

export type Account5AllocationLike = {
  account5Code?: string | null;
  netAmount: unknown;
  projectId?: string;
  project?: { code?: string | null; name?: string | null } | null;
};

/** Preferuje snapshot account5Code z alokacji; fallback tylko gdy brak snapshotu. */
export function resolveAllocationAccount5Code(a: Account5AllocationLike): string | null {
  const snap = a.account5Code?.trim();
  if (snap) return snap;
  return account5FromProjectCode(a.project?.code);
}

export type CostInvoiceAccount5Source = {
  costPlaceKind?: string | null;
  account5Code?: string | null;
  project?: { code?: string | null; name?: string | null } | null;
  projectAllocations?: Account5AllocationLike[] | null;
};

/** Pojedyncze konto 5 widoczne na liście (nie multi-project). */
export function resolveCostInvoiceSingleAccount5(r: CostInvoiceAccount5Source): string | null {
  const kind = r.costPlaceKind;
  if (kind === "GENERAL_502") return "502-01";
  if (kind === "MANAGEMENT_550") return "550-01";

  const allocs = r.projectAllocations ?? [];
  if (allocs.length === 1) {
    return resolveAllocationAccount5Code(allocs[0]);
  }
  if (allocs.length > 1) return null;

  const snap = r.account5Code?.trim();
  if (snap) return snap;
  return account5FromProjectCode(r.project?.code);
}

export function formatAccount5BreakdownClipboard(allocs: Account5AllocationLike[]): string {
  return allocs
    .map((a) => {
      const code = resolveAllocationAccount5Code(a) ?? "—";
      return `${code} - ${formatMoney(a.netAmount)} netto`;
    })
    .join("\n");
}

export function formatAccount5CodesList(allocs: Account5AllocationLike[]): string {
  return allocs
    .map((a) => resolveAllocationAccount5Code(a))
    .filter((c): c is string => Boolean(c?.trim()))
    .join("; ");
}

/** Buduje alokacje do schowka z wierszy formularza + snapshotów zapisanych na fakturze. */
export function buildAccount5AllocationsFromFormRows(
  rows: { projectId: string; netAmount: string }[],
  projects: { id: string; code?: string | null }[],
  savedAllocs?: Account5AllocationLike[] | null,
): Account5AllocationLike[] {
  return rows.map((row) => {
    const saved = savedAllocs?.find((a) => a.projectId === row.projectId);
    const project = projects.find((p) => p.id === row.projectId);
    return {
      account5Code: saved?.account5Code ?? null,
      netAmount: row.netAmount,
      projectId: row.projectId,
      project: project ? { code: project.code } : saved?.project ?? null,
    };
  });
}

export function isFixedPlaceAccount5(kind: string | null | undefined): boolean {
  return kind === "GENERAL_502" || kind === "MANAGEMENT_550";
}

export function fixedPlaceAccount5Code(kind: string | null | undefined): string | null {
  if (kind === "GENERAL_502" || kind === "MANAGEMENT_550") {
    return account5FromPlaceKind(kind);
  }
  return null;
}
