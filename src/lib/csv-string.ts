export function csvEscapeCell(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function rowsToCsv(rows: string[][]): string {
  return rows.map((r) => r.map(csvEscapeCell).join(",")).join("\r\n");
}
