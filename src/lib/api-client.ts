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
  const parsed = await readApiResponse(res);
  return parsed.errorText || res.statusText || `HTTP ${res.status}`;
}

/** Bezpieczne odczytanie body — nie rzuca przy HTML lub pustej odpowiedzi. */
export async function readApiResponse(res: Response): Promise<{
  ok: boolean;
  data: unknown;
  errorText: string;
}> {
  const text = await res.text();
  if (!text) {
    if (!res.ok) {
      return { ok: false, data: null, errorText: res.statusText || `HTTP ${res.status}` };
    }
    return { ok: true, data: null, errorText: "" };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const snippet = text.replace(/\s+/g, " ").slice(0, 200);
    return {
      ok: false,
      data: null,
      errorText: res.ok
        ? "Nieprawidłowa odpowiedź serwera (nie-JSON)."
        : snippet || res.statusText || `HTTP ${res.status}`,
    };
  }

  if (!res.ok) {
    return { ok: false, data, errorText: readApiErrorBody(data) };
  }
  return { ok: true, data, errorText: "" };
}
