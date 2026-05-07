import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { projectTaskCreateSchema } from "@/lib/validation/schemas";
import { mergeTaskLifecycle } from "@/lib/projects/project-task-lifecycle";
import { ZodError } from "zod";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
  if (!project) return jsonError("Nie znaleziono", 404);
  const tasks = await prisma.projectTask.findMany({
    where: { projectId: id },
    orderBy: [{ isDone: "asc" }, { plannedDate: "asc" }, { createdAt: "asc" }],
  });
  return jsonData(tasks);
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
    const data = projectTaskCreateSchema.parse(body);
    const lifePatch: { status?: "TODO" | "IN_PROGRESS" | "DONE"; isDone?: boolean } = {
      status: data.status,
    };
    if (data.isDone !== undefined) lifePatch.isDone = data.isDone;
    const life = mergeTaskLifecycle({ status: "TODO", isDone: false, doneAt: null }, lifePatch);

    const row = await prisma.projectTask.create({
      data: {
        projectId: id,
        title: data.title.trim(),
        description: data.description ?? null,
        assigneeName: data.assigneeName ?? null,
        plannedDate: data.plannedDate ? new Date(data.plannedDate) : null,
        priority: data.priority ?? null,
        status: life.status,
        isDone: life.isDone,
        doneAt: life.doneAt,
      },
    });
    return jsonData(row);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
