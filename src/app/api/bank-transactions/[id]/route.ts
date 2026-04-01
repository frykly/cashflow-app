import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { healBankTransactionLinks } from "@/lib/bank-import/heal-links";
import { z } from "zod";

const statuses = z.enum([
  "NEW",
  "MATCHED",
  "LINKED_COST",
  "LINKED_INCOME",
  "TRANSFER",
  "VAT_TOPUP",
  "IGNORED",
  "DUPLICATE",
  "BROKEN_LINK",
  "CREATED",
]);

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

  let normalized = parsed.data.status;
  if (normalized === "CREATED") normalized = "LINKED_COST";

  const updated = await prisma.bankTransaction.update({
    where: { id },
    data: { status: normalized },
  });
  await healBankTransactionLinks(prisma, updated.importId);
  const healed = await prisma.bankTransaction.findUnique({ where: { id } });
  return jsonData(healed ?? updated);
}
