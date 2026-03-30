export function formatProjectPickerLabel(p: {
  code?: string | null;
  name: string;
  clientName?: string | null;
  isActive?: boolean;
}): string {
  const code = p.code?.trim();
  const client = p.clientName?.trim();
  let s = code ? `${code} · ${p.name}` : p.name;
  if (client) s += ` · ${client}`;
  if (p.isActive === false) s += " (nieaktywny)";
  return s;
}
