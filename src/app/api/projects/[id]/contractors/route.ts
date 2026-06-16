import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { projectContractorCreateSchema } from "@/lib/validation/schemas";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

const includeContractor = {
  contractor: { select: { id: true, displayName: true, taxId: true, type: true } },
} as const;

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return jsonError("Nie znaleziono", 404);

  const rows = await prisma.projectContractor.findMany({
    where: { projectId: id },
    include: includeContractor,
    orderBy: [{ createdAt: "asc" }],
  });
  return jsonData(rows);
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return jsonError("Nie znaleziono", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }

  try {
    const data = projectContractorCreateSchema.parse(body);
    const contractor = await prisma.contractor.findUnique({
      where: { id: data.contractorId },
      select: { id: true },
    });
    if (!contractor) return jsonError("Nie znaleziono kontrahenta.", 404);

    try {
      const row = await prisma.projectContractor.create({
        data: {
          projectId: id,
          contractorId: data.contractorId,
          role: data.role,
          notes: data.notes,
        },
        include: includeContractor,
      });
      return jsonData(row, { status: 201 });
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "P2002") {
        return jsonError("Ten kontrahent jest już przypisany do projektu.", 409);
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
