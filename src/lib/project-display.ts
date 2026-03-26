/** Etykieta projektu: relacja, potem legacy projectName. */
export function projectDisplayLabel(r: {
  project?: { name: string } | null;
  projectName?: string | null;
}): string {
  const fromRel = r.project?.name?.trim();
  if (fromRel) return fromRel;
  return (r.projectName ?? "").trim();
}
