/** Etykieta projektu: relacja, potem legacy projectName. */
export function projectDisplayLabel(r: {
  project?: { name: string } | null;
  projectName?: string | null;
}): string {
  const fromRel = r.project?.name?.trim();
  if (fromRel) return fromRel;
  return (r.projectName ?? "").trim();
}

/** Lista / tabela: przy wielu alokacjach skrót; inaczej jak legacy. */
export function projectListLabel(r: {
  projectAllocations?: { project?: { name: string | null } | null }[] | null;
  project?: { name: string } | null;
  projectName?: string | null;
}): string {
  const allocs = r.projectAllocations;
  if (allocs && allocs.length > 0) {
    if (allocs.length === 1) return allocs[0]?.project?.name?.trim() || projectDisplayLabel(r);
    const names = allocs.map((a) => a.project?.name).filter(Boolean) as string[];
    if (names.length)
      return `${names.slice(0, 2).join(", ")}${allocs.length > 2 ? "…" : ""} (${allocs.length} proj.)`;
    return `${allocs.length} projekty`;
  }
  const leg = projectDisplayLabel(r);
  return leg || "—";
}

/** Jeden link docelowy: pierwszy projekt z alokacji albo legacy projectId. */
export function projectLinkTargetId(r: {
  projectAllocations?: { projectId: string }[] | null;
  projectId?: string | null;
}): string | null {
  if (r.projectAllocations && r.projectAllocations.length === 1) return r.projectAllocations[0]!.projectId;
  if (r.projectAllocations && r.projectAllocations.length > 1) return null;
  return r.projectId ?? null;
}

export type ProjectListLinkItem = {
  projectId: string;
  label: string;
};

/**
 * Osobne pozycje do linków w kolumnie „Projekt” (wiele alokacji lub jeden legacy).
 * Gdy `projectId` jest pusty, jest tylko legacy `projectName` — link nie jest możliwy.
 */
export function projectAllocationListLinks(r: {
  projectAllocations?: { projectId: string; project?: { name: string | null } | null }[] | null;
  projectId?: string | null;
  project?: { name: string } | null;
  projectName?: string | null;
}): ProjectListLinkItem[] {
  const allocs = r.projectAllocations;
  if (allocs && allocs.length > 0) {
    return allocs.map((a) => ({
      projectId: a.projectId,
      label: (a.project?.name ?? "").trim() || "Projekt",
    }));
  }
  const leg = projectDisplayLabel(r);
  if (!leg) return [];
  if (r.projectId) return [{ projectId: r.projectId, label: leg }];
  return [{ projectId: "", label: leg }];
}
