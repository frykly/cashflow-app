import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { projectUpdateSchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.project.findUnique({ where: { id } });
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

    const row = await prisma.project.update({
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

    if (data.name !== undefined && data.name.trim() !== existing.name) {
      await prisma.$transaction([
        prisma.costInvoice.updateMany({
          where: { projectId: id },
          data: { projectName: data.name.trim() },
        }),
        prisma.incomeInvoice.updateMany({
          where: { projectId: id },
          data: { projectName: data.name.trim() },
        }),
        prisma.plannedFinancialEvent.updateMany({
          where: { projectId: id },
          data: { projectName: data.name.trim() },
        }),
      ]);
    }

    return jsonData(row);
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
