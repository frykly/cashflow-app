import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, routeErrorResponse, zodErrorResponse } from "@/lib/api/errors";
import { ZodError, z } from "zod";

const createSchema = z.object({
  registrationNumber: z.string().trim().min(1, "Podaj numer rejestracyjny").max(32),
  name: z.string().trim().max(120).optional().nullable(),
  make: z.string().trim().max(80).optional().nullable(),
  model: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const activeOnly = searchParams.get("activeOnly") === "1";
    const picker = searchParams.get("picker") === "1";

    const rows = await prisma.vehicle.findMany({
      where: {
        ...(activeOnly || picker ? { isActive: true } : {}),
        ...(q
          ? {
              OR: [
                { registrationNumber: { contains: q } },
                { name: { contains: q } },
                { make: { contains: q } },
                { model: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: [{ isActive: "desc" }, { registrationNumber: "asc" }],
      take: picker ? 40 : undefined,
    });
    return jsonData(rows);
  } catch (e) {
    return routeErrorResponse(e, "GET /api/vehicles");
  }
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = createSchema.parse(body);
    const row = await prisma.vehicle.create({
      data: {
        registrationNumber: data.registrationNumber.trim().toUpperCase(),
        name: data.name?.trim() || null,
        make: data.make?.trim() || null,
        model: data.model?.trim() || null,
        notes: data.notes?.trim() || null,
        isActive: data.isActive ?? true,
      },
    });
    return jsonData(row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
