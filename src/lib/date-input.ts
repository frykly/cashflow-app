/**
 * Mapowanie dat API ↔ input[type=date] (tylko dzień, bez czasu).
 * Zapis: południe UTC dla podanej kalendarzowej daty — stabilne przy parsowaniu i prognozie.
 */

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** Z ISO / obiektu z API → wartość dla input[type=date] (YYYY-MM-DD). */
export function isoToDateInputValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value !== null && Object.keys(value as object).length === 0) return "";
  const s = String(value).trim();
  if (s === "") return "";
  const m = s.match(YMD);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Z pola date (YYYY-MM-DD) → ISO do API; pusto → null. */
export function dateInputToIso(value: string | null | undefined): string | null {
  const t = String(value ?? "").trim();
  if (t === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  return `${t}T12:00:00.000Z`;
}
