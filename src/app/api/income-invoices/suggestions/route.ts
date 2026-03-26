import { prisma } from "@/lib/db";
import { jsonData } from "@/lib/api/json-response";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim().toLowerCase() ?? "";
  const rows = await prisma.incomeInvoice.findMany({ select: { contractor: true } });
  const map = new Map<string, { display: string; n: number }>();
  for (const r of rows) {
    const t = r.contractor.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    const ex = map.get(k);
    if (!ex) map.set(k, { display: t, n: 1 });
    else ex.n++;
  }
  let list = [...map.values()].sort((a, b) => b.n - a.n || a.display.localeCompare(b.display, "pl"));
  if (q) list = list.filter((x) => x.display.toLowerCase().includes(q));
  return jsonData({ names: list.map((x) => x.display) });
}
