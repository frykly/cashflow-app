import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { z } from "zod";

const statuses = z.enum(["NEW", "MATCHED", "IGNORED", "CREATED", "TRANSFER"]);

const patchSchema = z.object({
  status: statuses,
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Nieprawidłowy status", 422);

  const existing = await prisma.bankTransaction.findUnique({ where: { id } });
  if (!existing) return jsonError("Nie znaleziono transakcji", 404);

  const updated = await prisma.bankTransaction.update({
    where: { id },
    data: { status: parsed.data.status },
  });
  return jsonData(updated);
}
