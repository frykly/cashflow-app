/** Wartości w bazie (String) — SQLite bez natywnych enumów w Prisma. */
export const PROJECT_LIFECYCLE_VALUES = ["NEW", "IN_PROGRESS", "FOR_HANDOFF", "COMPLETED"] as const;
export type ProjectLifecycleValue = (typeof PROJECT_LIFECYCLE_VALUES)[number];

export const PROJECT_SETTLEMENT_VALUES = [
  "NONE",
  "TO_SETTLE",
  "WAITING_FOR_SETTLEMENT",
  "DPW_TODO",
  "SETTLED",
  "SETTLED_WITH_GAPS",
  "SETTLED_BLOCKED",
] as const;
export type ProjectSettlementValue = (typeof PROJECT_SETTLEMENT_VALUES)[number];

const LIFECYCLE_LABELS: Record<ProjectLifecycleValue, string> = {
  NEW: "Nowy",
  IN_PROGRESS: "W trakcie",
  FOR_HANDOFF: "Odbioru",
  COMPLETED: "Zakończony",
};

const SETTLEMENT_LABELS: Record<ProjectSettlementValue, string> = {
  NONE: "Brak",
  TO_SETTLE: "Do rozliczenia",
  WAITING_FOR_SETTLEMENT: "Oczekiwanie na rozliczenie",
  DPW_TODO: "DPW do zrobienia",
  SETTLED: "Rozliczone",
  SETTLED_WITH_GAPS: "Rozliczone — braki",
  SETTLED_BLOCKED: "Rozliczone — blokada",
};

export function projectLifecycleLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return LIFECYCLE_LABELS[v as ProjectLifecycleValue] ?? v;
}

export function projectSettlementLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return SETTLEMENT_LABELS[v as ProjectSettlementValue] ?? v;
}

export function lifecycleBadgeVariant(
  v: string | null | undefined,
): "default" | "success" | "warning" | "muted" {
  if (v === "COMPLETED") return "success";
  if (v === "FOR_HANDOFF") return "warning";
  if (!v) return "muted";
  return "default";
}

export function settlementBadgeVariant(
  v: string | null | undefined,
): "default" | "success" | "warning" | "danger" | "muted" {
  if (v === "SETTLED") return "success";
  if (v === "SETTLED_WITH_GAPS" || v === "TO_SETTLE" || v === "WAITING_FOR_SETTLEMENT" || v === "DPW_TODO")
    return "warning";
  if (v === "SETTLED_BLOCKED") return "danger";
  if (!v || v === "NONE") return "muted";
  return "default";
}
