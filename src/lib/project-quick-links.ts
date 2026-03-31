import type { Project } from "@prisma/client";

/** Query string dla `/income-invoices` — nowa faktura z kontekstu projektu. */
export function incomeInvoiceNewFromProjectQuery(project: Pick<Project, "id" | "name" | "clientName" | "code">): string {
  const sp = new URLSearchParams();
  sp.set("new", "1");
  sp.set("projectId", project.id);
  sp.set("projectName", project.name);
  if (project.clientName?.trim()) sp.set("clientName", project.clientName.trim());
  if (project.code?.trim()) sp.set("projectCode", project.code.trim());
  return sp.toString();
}

/** Query string dla `/cost-invoices` — nowa faktura kosztowa z kontekstu projektu. */
export function costInvoiceNewFromProjectQuery(project: Pick<Project, "id" | "name" | "clientName" | "code">): string {
  const sp = new URLSearchParams();
  sp.set("new", "1");
  sp.set("projectId", project.id);
  sp.set("projectName", project.name);
  if (project.clientName?.trim()) sp.set("clientName", project.clientName.trim());
  if (project.code?.trim()) sp.set("projectCode", project.code.trim());
  return sp.toString();
}

/** Query string dla `/planned-events` — nowe zdarzenie z kontekstu projektu. */
export function plannedEventNewFromProjectQuery(project: Pick<Project, "id" | "name" | "clientName" | "code">): string {
  const sp = new URLSearchParams();
  sp.set("new", "1");
  sp.set("projectId", project.id);
  sp.set("projectName", project.name);
  if (project.clientName?.trim()) sp.set("clientName", project.clientName.trim());
  if (project.code?.trim()) sp.set("projectCode", project.code.trim());
  return sp.toString();
}
