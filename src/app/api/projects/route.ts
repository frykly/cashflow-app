import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { projectCreateSchema } from "@/lib/validation/schemas";
import { ZodError } from "zod";
import type { Prisma } from "@prisma/client";
import {
  listProjectsEnriched,
  type ProjectListSortKey,
} from "@/lib/projects/project-list-enriched";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("picker") === "1") {
    const qPicker = searchParams.get("q")?.trim() ?? "";
    const selectedId = searchParams.get("selectedId")?.trim();

    const where: Prisma.ProjectWhereInput = qPicker
      ? {
          isActive: true,
          OR: [
            { name: { contains: qPicker } },
            { code: { contains: qPicker } },
            { clientName: { contains: qPicker } },
          ],
        }
      : { isActive: true };

    let rows = await prisma.project.findMany({
      where,
      orderBy: { name: "asc" },
      take: 60,
    });

    if (selectedId) {
      const extra = await prisma.project.findUnique({ where: { id: selectedId } });
      if (extra && !rows.some((r) => r.id === extra.id)) {
        rows = [extra, ...rows];
      }
    }
    return jsonData(rows);
  }

  const q = searchParams.get("q")?.trim() ?? "";
  const active = searchParams.get("active")?.trim() ?? "";
  const includeSettled = searchParams.get("includeSettled") === "1";
  const sortParam = searchParams.get("sort")?.trim() ?? "name";
  const order = searchParams.get("order") === "desc" ? "desc" : "asc";
  const SORT_KEYS: ProjectListSortKey[] = [
    "code",
    "name",
    "clientName",
    "lifecycleStatus",
    "settlementStatus",
    "plannedRevenueNet",
    "plannedCostNet",
    "paidTotal",
    "actualResult",
  ];
  const sort: ProjectListSortKey = SORT_KEYS.includes(sortParam as ProjectListSortKey)
    ? (sortParam as ProjectListSortKey)
    : "name";

  const rows = await listProjectsEnriched({
    q: q || undefined,
    active: active || undefined,
    includeSettled,
    sort,
    order,
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
        lifecycleStatus: data.lifecycleStatus ?? null,
        settlementStatus: data.settlementStatus ?? null,
        plannedRevenueNet: data.plannedRevenueNet ?? null,
        plannedCostNet: data.plannedCostNet ?? null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });
    return jsonData(row, { status: 201 });
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
