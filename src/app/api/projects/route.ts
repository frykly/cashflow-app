import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { projectCreateSchema } from "@/lib/validation/schemas";
import { ZodError } from "zod";
import type { Prisma } from "@prisma/client";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const active = searchParams.get("active")?.trim();

  const filters: Prisma.ProjectWhereInput[] = [];
  if (q) {
    filters.push({
      OR: [
        { name: { contains: q } },
        { code: { contains: q } },
        { clientName: { contains: q } },
      ],
    });
  }
  if (active === "1" || active === "true") filters.push({ isActive: true });
  if (active === "0" || active === "false") filters.push({ isActive: false });

  const where = filters.length ? { AND: filters } : {};

  const rows = await prisma.project.findMany({
    where,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
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
    const data = projectCreateSchema.parse(body);
    const row = await prisma.project.create({
      data: {
        name: data.name.trim(),
        code: data.code?.trim() || null,
        clientName: data.clientName?.trim() || null,
        description: data.description?.trim() || null,
        isActive: data.isActive ?? true,
      },
    });
    return jsonData(row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
