import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";
import { jsonError, zodErrorResponse } from "@/lib/api/errors";
import { appSettingsSchema } from "@/lib/validation/schemas";
import { ZodError } from "zod";

export async function GET() {
  const row = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!row) return jsonError("Brak ustawień — zapisz saldo początkowe", 404);
  return jsonData(row);
}

export async function PUT(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Nieprawidłowy JSON");
  }
  try {
    const data = appSettingsSchema.parse(body);
    const row = await prisma.appSettings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        mainOpeningBalance: data.mainOpeningBalance,
        vatOpeningBalance: data.vatOpeningBalance,
        effectiveFrom: new Date(data.effectiveFrom),
      },
      update: {
        mainOpeningBalance: data.mainOpeningBalance,
        vatOpeningBalance: data.vatOpeningBalance,
        effectiveFrom: new Date(data.effectiveFrom),
      },
    });
    return jsonData(row);
  } catch (e) {
    if (e instanceof ZodError) return zodErrorResponse(e);
    throw e;
  }
}
