import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { projectTaskUpdateSchema } from "@/lib/validation/schemas";
import { mergeTaskLifecycle } from "@/lib/projects/project-task-lifecycle";
import { ZodError } from "zod";
import type { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string; taskId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id, taskId } = await ctx.params;
  const existing = await prisma.projectTask.findFirst({ where: { id: taskId, projectId: id } });
  if (!existing) return jsonError("Nie znaleziono", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }

  try {
    const data = projectTaskUpdateSchema.parse(body);

    let status = existing.status;
    let isDone = existing.isDone;
    let doneAt: Date | null = existing.doneAt;
    if (data.status !== undefined || data.isDone !== undefined) {
      const lifePatch: { status?: "TODO" | "IN_PROGRESS" | "DONE"; isDone?: boolean } = {};
      if (data.status !== undefined) lifePatch.status = data.status;
      if (data.isDone !== undefined) lifePatch.isDone = data.isDone;
      const life = mergeTaskLifecycle(existing, lifePatch);
      status = life.status;
      isDone = life.isDone;
      doneAt = life.doneAt;
    }

    const update: Prisma.ProjectTaskUpdateInput = {
      status,
      isDone,
      doneAt,
    };
    if (data.title !== undefined) update.title = data.title.trim();
    if (data.description !== undefined) update.description = data.description;
    if (data.assigneeName !== undefined) update.assigneeName = data.assigneeName;
    if (data.plannedDate !== undefined) {
      update.plannedDate = data.plannedDate ? new Date(data.plannedDate) : null;
    }
    if (data.priority !== undefined) update.priority = data.priority;

    const row = await prisma.projectTask.update({
      where: { id: taskId },
      data: update,
    });
    return jsonData(row);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, taskId } = await ctx.params;
  const existing = await prisma.projectTask.findFirst({ where: { id: taskId, projectId: id } });
  if (!existing) return jsonError("Nie znaleziono", 404);
  await prisma.projectTask.delete({ where: { id: taskId } });
  return jsonData({ ok: true });
}
