/** Tekst błędu z odpowiedzi JSON API (Zod flatten lub { error }). */
export function readApiErrorBody(data: unknown): string {
  if (!data || typeof data !== "object") return "Nieznany błąd";
  const o = data as Record<string, unknown>;
  if (typeof o.error === "string") return o.error;
  const issues = o.issues as
    | { fieldErrors?: Record<string, string[]>; formErrors?: string[] }
    | undefined;
  if (issues?.fieldErrors) {
    const lines = Object.entries(issues.fieldErrors).flatMap(([k, arr]) =>
      (arr ?? []).map((msg) => `${k}: ${msg}`),
    );
    if (lines.length) return lines.join("\n");
  }
  if (issues?.formErrors?.length) return issues.formErrors.join("\n");
  return "Żądanie nie powiodło się";
}

export async function readApiError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return readApiErrorBody(j);
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}
