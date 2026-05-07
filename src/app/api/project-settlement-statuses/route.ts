import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { slugifyBase } from "@/lib/category-resolve";
import { ZodError, z } from "zod";

const createSchema = z.object({
  name: z.string().trim().min(1, "Podaj nazwę").max(120),
});

export async function GET() {
  const rows = await prisma.projectSettlementStatusOption.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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
    const data = createSchema.parse(body);
    const slug = `${slugifyBase(data.name)}-${Date.now().toString(36)}`;
    const agg = await prisma.projectSettlementStatusOption.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (agg._max.sortOrder ?? 0) + 10;
    const row = await prisma.projectSettlementStatusOption.create({
      data: { name: data.name.trim(), slug, sortOrder, isActive: true },
    });
    return jsonData(row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
