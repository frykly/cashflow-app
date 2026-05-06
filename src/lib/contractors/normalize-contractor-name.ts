const LEGAL_FORM_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bspolka\s+z\s+ograniczona\s+odpowiedzialnoscia\b/g, "sp zoo"],
  [/\bsp\s+z\s+o\s+o\b/g, "sp zoo"],
  [/\bsp\s+zoo\b/g, "sp zoo"],
  [/\bspolka\s+akcyjna\b/g, "sa"],
  [/\bs\s+a\b/g, "sa"],
];

export function normalizeContractorName(value: string | null | undefined): string {
  let normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,;:()[\]{}"']/g, " ")
    .replace(/[&/+_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const [pattern, replacement] of LEGAL_FORM_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
}

export function normalizeTaxId(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").replace(/\D/g, "").trim();
  return normalized || null;
}
