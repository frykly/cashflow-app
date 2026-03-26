import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function zodErrorResponse(e: ZodError) {
  return NextResponse.json(
    { error: "Walidacja nie powiodła się", issues: e.flatten() },
    { status: 422 },
  );
}
