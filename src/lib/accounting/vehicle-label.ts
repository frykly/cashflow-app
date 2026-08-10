export function formatVehicleLabel(v: {
  registrationNumber: string;
  make?: string | null;
  model?: string | null;
  name?: string | null;
}): string {
  const reg = v.registrationNumber.trim();
  const makeModel = [v.make?.trim(), v.model?.trim()].filter(Boolean).join(" ");
  if (makeModel) return `${reg} · ${makeModel}`;
  const name = v.name?.trim();
  if (name) return `${reg} · ${name}`;
  return reg;
}
