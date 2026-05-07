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
import { sortProjectsByCodeAsc } from "@/lib/project-picker-sort";
import { syncProjectMissingItemsTx } from "@/lib/projects/sync-project-missing-items";

const projectIncludeList = {
  missingItems: {
    include: {
      missingType: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} satisfies Prisma.ProjectInclude;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  if (searchParams.get("picker") === "1") {
    const qPicker = searchParams.get("q")?.trim() ?? "";
    const selectedId = searchParams.get("selectedId")?.trim();
    const sortByCode = searchParams.get("sort") === "code";
    /** Koszty z importu: wyszukaj także nieaktywne / zakończone projekty. */
    const includeInactive = searchParams.get("includeInactive") === "1";

    const where: Prisma.ProjectWhereInput = qPicker
      ? {
          ...(!includeInactive ? { isActive: true } : {}),
          OR: [
            { name: { contains: qPicker } },
            { code: { contains: qPicker } },
            { clientName: { contains: qPicker } },
          ],
        }
      : includeInactive
        ? {}
        : { isActive: true };

    const takeCap = sortByCode || includeInactive ? 250 : 60;

    let rows = await prisma.project.findMany({
      where,
      ...(sortByCode ? {} : { orderBy: { name: "asc" as const } }),
      take: takeCap,
      include: projectIncludeList,
    });

    if (sortByCode) {
      rows = sortProjectsByCodeAsc(rows);
    }

    if (selectedId) {
      const extra = await prisma.project.findUnique({ where: { id: selectedId }, include: projectIncludeList });
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
    try {
      const row = await prisma.$transaction(async (tx) => {
        const p = await tx.project.create({
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
        try {
          await syncProjectMissingItemsTx(tx, p.id, data.missingTypeIds);
        } catch (e) {
          if (e instanceof Error && e.message === "INVALID_MISSING_TYPES") {
            throw new Error("INVALID_MISSING_TYPES");
          }
          throw e;
        }
        return p;
      });
      const full = await prisma.project.findUnique({ where: { id: row.id }, include: projectIncludeList });
      return jsonData(full ?? row, { status: 201 });
    } catch (e) {
      if (e instanceof Error && e.message === "INVALID_MISSING_TYPES") {
        return jsonError("Nieprawidłowy typ braku projektu.", 400);
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
