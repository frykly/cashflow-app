import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Tx = Omit<
  Prisma.TransactionClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use"
>;

export async function syncProjectMissingItemsTx(
  tx: Tx,
  projectId: string,
  missingTypeIds: string[] | undefined,
): Promise<void> {
  if (missingTypeIds === undefined) return;
  const uniq = [...new Set(missingTypeIds.filter(Boolean))];
  if (uniq.length) {
    const n = await tx.projectMissingTypeOption.count({ where: { id: { in: uniq } } });
    if (n !== uniq.length) {
      throw new Error("INVALID_MISSING_TYPES");
    }
  }
  await tx.projectMissingItem.deleteMany({ where: { projectId } });
  if (uniq.length) {
    await tx.projectMissingItem.createMany({
      data: uniq.map((missingTypeId) => ({ projectId, missingTypeId })),
    });
  }
}

export async function syncProjectMissingItems(projectId: string, missingTypeIds: string[] | undefined): Promise<void> {
  if (missingTypeIds === undefined) return;
  await prisma.$transaction(async (tx) => {
    await syncProjectMissingItemsTx(tx, projectId, missingTypeIds);
  });
}
