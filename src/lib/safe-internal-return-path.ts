/** Same-origin path only — blocks `//evil` and absolute URLs. */
export function safeInternalReturnPath(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  if (t.includes("://")) return null;
  return t;
}

export type PostCreateReturnCapture = { returnTo: string | null; sourceProjectId: string | null };

export function postCreateReturnFromSearchParams(m: URLSearchParams): PostCreateReturnCapture {
  return {
    returnTo: safeInternalReturnPath(m.get("returnTo")),
    sourceProjectId: m.get("projectId")?.trim() || null,
  };
}
