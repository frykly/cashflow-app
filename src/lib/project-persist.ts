import type { Prisma, PrismaClient } from "@prisma/client";

type ProjectDb = PrismaClient | Prisma.TransactionClient;

/** Zapis spójny: projectId + projectName (denormalizacja legacy dla starych odczytów). */
export async function resolveProjectFields(
  db: ProjectDb,
  projectId: string | null | undefined,
): Promise<{ projectId: string | null; projectName: string | null }> {
  if (projectId === null || projectId === undefined) {
    return { projectId: null, projectName: null };
  }
  const p = await db.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
  if (!p) throw new Error("INVALID_PROJECT_ID");
  return { projectId: p.id, projectName: p.name };
}
