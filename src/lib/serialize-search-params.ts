/** Serializacja `searchParams` ze strony serwerowej (Next App Router) do query stringa bez `useSearchParams` po stronie klienta. */
export function serializeSearchParamsRecord(
  sp: Record<string, string | string[] | undefined>,
): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        u.append(k, item);
      }
    } else {
      u.set(k, v);
    }
  }
  return u.toString();
}
