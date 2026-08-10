import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Mapuje wyjątki Prisma / serwera na JSON z komunikatem (zamiast pustego 500). */
export function routeErrorResponse(e: unknown, logLabel?: string) {
  if (logLabel) console.error(logLabel, e);

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2021" || e.code === "P2022") {
      return jsonError(
        "Baza danych nie ma zastosowanej migracji księgowej. Uruchom: npx prisma migrate deploy && npx prisma generate",
        503,
      );
    }
  }

  if (e instanceof Prisma.PrismaClientValidationError) {
    return jsonError(
      "Klient Prisma jest nieaktualny względem schematu. Uruchom: npx prisma generate (w dev wystarczy odświeżyć stronę).",
      503,
    );
  }

  const message = e instanceof Error ? e.message : "Błąd serwera";
  return jsonError(message, 500);
}

export function zodErrorResponse(e: ZodError) {
  return NextResponse.json(
    { error: "Walidacja nie powiodła się", issues: e.flatten() },
    { status: 422 },
  );
}
