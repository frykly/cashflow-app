import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { NextResponse } from "next/server";
import { ZodError, z } from "zod";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999999).optional(),
});

async function usageCounts(id: string) {
  const items = await prisma.projectMissingItem.count({ where: { missingTypeId: id } });
  return { projectLinks: items, total: items };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await prisma.projectMissingTypeOption.findUnique({ where: { id } });
  if (!row) return jsonError("Nie znaleziono", 404);
  const usage = await usageCounts(id);
  return jsonData({ ...row, usage });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = patchSchema.parse(body);
    if (data.name === undefined && data.isActive === undefined && data.sortOrder === undefined) {
      return jsonError("Brak pól do aktualizacji", 400);
    }
    const row = await prisma.projectMissingTypeOption.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });
    return jsonData(row);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    return jsonError("Nie można zaktualizować", 400);
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const usage = await usageCounts(id);
  if (usage.total > 0) {
    return NextResponse.json(
      { error: "Typ braku jest przypisany do projektów — zarchiwizuj zamiast usuwać.", usage },
      { status: 409 },
    );
  }
  await prisma.projectMissingTypeOption.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
