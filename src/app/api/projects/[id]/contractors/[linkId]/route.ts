import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { projectContractorUpdateSchema } from "@/lib/validation/schemas";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string; linkId: string }> };

const includeContractor = {
  contractor: { select: { id: true, displayName: true, taxId: true, type: true } },
} as const;

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, linkId } = await ctx.params;
  const existing = await prisma.projectContractor.findFirst({ where: { id: linkId, projectId: id } });
  if (!existing) return jsonError("Nie znaleziono", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }

  try {
    const data = projectContractorUpdateSchema.parse(body);
    const update: { role?: string | null; notes?: string | null } = {};
    if (data.role !== undefined) update.role = data.role;
    if (data.notes !== undefined) update.notes = data.notes;

    const row = await prisma.projectContractor.update({
      where: { id: linkId },
      data: update,
      include: includeContractor,
    });
    return jsonData(row);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, linkId } = await ctx.params;
  const existing = await prisma.projectContractor.findFirst({ where: { id: linkId, projectId: id } });
  if (!existing) return jsonError("Nie znaleziono", 404);
  await prisma.projectContractor.delete({ where: { id: linkId } });
  return jsonData({ ok: true });
}
