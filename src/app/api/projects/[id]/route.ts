import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { projectUpdateSchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Prisma } from "@prisma/client";
import { syncProjectMissingItemsTx } from "@/lib/projects/sync-project-missing-items";

type Ctx = { params: Promise<{ id: string }> };

const projectIncludeDetail = {
  missingItems: {
    include: {
      missingType: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ProjectInclude;

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.project.findUnique({ where: { id }, include: projectIncludeDetail });
  if (!row) return jsonError("Nie znaleziono", 404);
  return jsonData(row);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = projectUpdateSchema.parse(body);
    const existing = await prisma.project.findUnique({ where: { id } });
    if (!existing) return jsonError("Nie znaleziono", 404);

    try {
      await prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id },
          data: {
            name: data.name !== undefined ? data.name.trim() : existing.name,
            code: data.code !== undefined ? (data.code?.trim() || null) : existing.code,
            clientName: data.clientName !== undefined ? (data.clientName?.trim() || null) : existing.clientName,
            description: data.description !== undefined ? (data.description?.trim() || null) : existing.description,
            isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
            lifecycleStatus:
              data.lifecycleStatus !== undefined ? data.lifecycleStatus : existing.lifecycleStatus,
            settlementStatus:
              data.settlementStatus !== undefined ? data.settlementStatus : existing.settlementStatus,
            plannedRevenueNet:
              data.plannedRevenueNet !== undefined ? data.plannedRevenueNet : existing.plannedRevenueNet,
            plannedCostNet:
              data.plannedCostNet !== undefined ? data.plannedCostNet : existing.plannedCostNet,
            startDate:
              data.startDate === undefined
                ? existing.startDate
                : data.startDate
                  ? new Date(data.startDate)
                  : null,
            endDate:
              data.endDate === undefined ? existing.endDate : data.endDate ? new Date(data.endDate) : null,
          },
        });

        if (data.missingTypeIds !== undefined) {
          await syncProjectMissingItemsTx(tx, id, data.missingTypeIds);
        }

        if (data.name !== undefined && data.name.trim() !== existing.name) {
          await tx.costInvoice.updateMany({
            where: { projectId: id },
            data: { projectName: data.name.trim() },
          });
          await tx.incomeInvoice.updateMany({
            where: { projectId: id },
            data: { projectName: data.name.trim() },
          });
          await tx.plannedFinancialEvent.updateMany({
            where: { projectId: id },
            data: { projectName: data.name.trim() },
          });
        }
      });
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_MISSING_TYPES") {
        return jsonError("Nieprawidłowy typ braku projektu.", 400);
      }
      throw e;
    }

    const full = await prisma.project.findUnique({ where: { id }, include: projectIncludeDetail });
    if (!full) return jsonError("Nie znaleziono", 404);
    return jsonData(full);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.project.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return jsonError("Nie można usunąć (projekt może być przypisany do dokumentów).", 409);
  }
}
