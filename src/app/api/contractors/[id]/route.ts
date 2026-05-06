import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { normalizeContractorName, normalizeTaxId } from "@/lib/contractors/normalize-contractor-name";
import { contractorUpdateSchema } from "@/lib/validation/schemas";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

function aliasCreateRows(aliases: { aliasName: string; source?: string | null }[]) {
  return aliases
    .map((a) => ({
      aliasName: a.aliasName.trim(),
      normalizedAlias: normalizeContractorName(a.aliasName),
      source: a.source?.trim() || null,
    }))
    .filter((a) => a.aliasName && a.normalizedAlias);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = await prisma.contractor.findUnique({
    where: { id },
    include: { aliases: { orderBy: [{ aliasName: "asc" }, { createdAt: "asc" }] } },
  });
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
    const data = contractorUpdateSchema.parse(body);
    const existing = await prisma.contractor.findUnique({ where: { id } });
    if (!existing) return jsonError("Nie znaleziono", 404);

    const displayName = data.displayName !== undefined ? data.displayName.trim() : existing.displayName;
    const normalizedName =
      data.displayName !== undefined ? normalizeContractorName(displayName) : existing.normalizedName;
    if (!normalizedName) return jsonError("Nazwa kontrahenta jest nieprawidłowa", 400);

    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.contractor.update({
        where: { id },
        data: {
          displayName,
          normalizedName,
          taxId: data.taxId !== undefined ? normalizeTaxId(data.taxId) : existing.taxId,
          type: data.type !== undefined ? data.type?.trim() || null : existing.type,
          notes: data.notes !== undefined ? data.notes?.trim() || null : existing.notes,
        },
      });

      if (data.aliases !== undefined) {
        await tx.contractorAlias.deleteMany({ where: { contractorId: id } });
        const aliases = aliasCreateRows(data.aliases);
        if (aliases.length > 0) {
          await tx.contractorAlias.createMany({
            data: aliases.map((a) => ({ ...a, contractorId: id })),
          });
        }
      }

      return updated;
    });

    const fresh = await prisma.contractor.findUnique({
      where: { id: row.id },
      include: { aliases: { orderBy: [{ aliasName: "asc" }, { createdAt: "asc" }] } },
    });

    return jsonData(fresh ?? row);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.contractor.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return jsonError("Nie znaleziono", 404);
  }
}
