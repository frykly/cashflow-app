import type { Project } from "@prisma/client";

/** Porównanie po numerze zlecenia: same cyfry → porządek numeryczny; brak kodu → na końcu; potem nazwa. */
export function compareProjectCodeAsc(
  a: Pick<Project, "code" | "name">,
  b: Pick<Project, "code" | "name">,
): number {
  const na = a.code?.trim() || null;
  const nb = b.code?.trim() || null;
  if (na === null && nb === null) return a.name.localeCompare(b.name, "pl");
  if (na === null) return 1;
  if (nb === null) return -1;
  if (/^\d+$/.test(na) && /^\d+$/.test(nb)) return parseInt(na, 10) - parseInt(nb, 10);
  const c = na.localeCompare(nb, "pl");
  return c !== 0 ? c : a.name.localeCompare(b.name, "pl");
}

export function sortProjectsByCodeAsc<T extends Pick<Project, "code" | "name">>(projects: T[]): T[] {
  return [...projects].sort(compareProjectCodeAsc);
}
