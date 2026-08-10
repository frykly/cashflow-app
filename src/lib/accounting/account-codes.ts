export const COST_PLACE_KINDS = ["UNCLASSIFIED", "PROJECT", "GENERAL_502", "MANAGEMENT_550"] as const;
export type CostPlaceKind = (typeof COST_PLACE_KINDS)[number];

export function isCostPlaceKind(v: unknown): v is CostPlaceKind {
  return typeof v === "string" && (COST_PLACE_KINDS as readonly string[]).includes(v);
}

/** Konto 5 z numeru zlecenia projektu. */
export function account5FromProjectCode(code: string | null | undefined): string | null {
  const c = code?.trim();
  if (!c) return null;
  return `501-${c}`;
}

export function account5FromPlaceKind(kind: CostPlaceKind): string | null {
  if (kind === "GENERAL_502") return "502-01";
  if (kind === "MANAGEMENT_550") return "550-01";
  return null;
}

export function costPlaceKindLabel(kind: string | null | undefined): string {
  if (kind === "PROJECT") return "Projekt / zlecenie (501)";
  if (kind === "GENERAL_502") return "Koszty ogólne (502-01)";
  if (kind === "MANAGEMENT_550") return "Koszty zarządu (550-01)";
  if (kind === "UNCLASSIFIED") return "Niesklasyfikowane";
  return kind?.trim() || "—";
}

export function formatAccount4Display(cat: {
  accountingCode?: string | null;
  accountingName?: string | null;
  name: string;
} | null | undefined): string | null {
  if (!cat) return null;
  const code = cat.accountingCode?.trim();
  const label = (cat.accountingName?.trim() || cat.name).trim();
  if (code) return `${code} · ${label}`;
  return label || null;
}

export function formatAccount5Display(code: string | null | undefined, hint?: string | null): string | null {
  const c = code?.trim();
  if (!c) return null;
  const h = hint?.trim();
  return h ? `${c} · ${h}` : c;
}

export function resolveAccount5Snapshot(params: {
  costPlaceKind: CostPlaceKind;
  projectCode?: string | null;
  allocationCodes?: (string | null | undefined)[];
}): string | null {
  if (params.costPlaceKind === "GENERAL_502") return "502-01";
  if (params.costPlaceKind === "MANAGEMENT_550") return "550-01";
  if (params.costPlaceKind === "UNCLASSIFIED") return null;
  const fromProject = account5FromProjectCode(params.projectCode);
  if (fromProject) return fromProject;
  const fromAlloc = (params.allocationCodes ?? []).map((c) => c?.trim()).find(Boolean);
  return fromAlloc ?? null;
}
