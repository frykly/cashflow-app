import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { normalizeContractorName, normalizeTaxId } from "@/lib/contractors/normalize-contractor-name";
import { contractorCreateSchema } from "@/lib/validation/schemas";
import { ZodError } from "zod";
import type { Prisma } from "@prisma/client";

function aliasCreateRows(aliases: { aliasName: string; source?: string | null }[]) {
  return aliases
    .map((a) => ({
      aliasName: a.aliasName.trim(),
      normalizedAlias: normalizeContractorName(a.aliasName),
      source: a.source?.trim() || null,
    }))
    .filter((a) => a.aliasName && a.normalizedAlias);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const normalizedQ = normalizeContractorName(q);
  const taxQ = normalizeTaxId(q);

  const where: Prisma.ContractorWhereInput =
    q ?
      {
        OR: [
          { displayName: { contains: q } },
          { normalizedName: { contains: normalizedQ } },
          ...(taxQ ? [{ taxId: { contains: taxQ } }] : []),
          { aliases: { some: { aliasName: { contains: q } } } },
          { aliases: { some: { normalizedAlias: { contains: normalizedQ } } } },
        ],
      }
    : {};

  const rows = await prisma.contractor.findMany({
    where,
    orderBy: [{ displayName: "asc" }, { createdAt: "asc" }],
    include: { aliases: { orderBy: [{ aliasName: "asc" }, { createdAt: "asc" }] } },
  });

  return jsonData(rows);
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }

  try {
    const data = contractorCreateSchema.parse(body);
    const displayName = data.displayName.trim();
    const normalizedName = normalizeContractorName(displayName);
    if (!normalizedName) return jsonError("Nazwa kontrahenta jest nieprawidłowa", 400);

    const row = await prisma.contractor.create({
      data: {
        displayName,
        normalizedName,
        taxId: normalizeTaxId(data.taxId),
        type: data.type?.trim() || null,
        notes: data.notes?.trim() || null,
        aliases: { create: aliasCreateRows(data.aliases) },
      },
      include: { aliases: { orderBy: [{ aliasName: "asc" }, { createdAt: "asc" }] } },
    });

    return jsonData(row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
