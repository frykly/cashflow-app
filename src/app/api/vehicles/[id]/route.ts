import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { ZodError, z } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  registrationNumber: z.string().trim().min(1).max(32).optional(),
  name: z.string().trim().max(120).optional().nullable(),
  make: z.string().trim().max(80).optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.vehicle.findUnique({ where: { id } });
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
    const data = updateSchema.parse(body);
    const existing = await prisma.vehicle.findUnique({ where: { id } });
    if (!existing) return jsonError("Nie znaleziono", 404);
    const row = await prisma.vehicle.update({
      where: { id },
      data: {
        ...(data.registrationNumber !== undefined
          ? { registrationNumber: data.registrationNumber.trim().toUpperCase() }
          : {}),
        ...(data.name !== undefined ? { name: data.name?.trim() || null } : {}),
        ...(data.make !== undefined ? { make: data.make?.trim() || null } : {}),
        ...(data.model !== undefined ? { model: data.model?.trim() || null } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return jsonData(row);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const existing = await prisma.vehicle.findUnique({
    where: { id },
    include: { _count: { select: { costInvoices: true } } },
  });
  if (!existing) return jsonError("Nie znaleziono", 404);
  if (existing._count.costInvoices > 0) {
    await prisma.vehicle.update({ where: { id }, data: { isActive: false } });
    return jsonData({ id, archived: true });
  }
  await prisma.vehicle.delete({ where: { id } });
  return jsonData({ id, deleted: true });
}
