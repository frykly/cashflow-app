import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { runKsefSync } from "@/lib/ksef/sync-documents";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let syncFrom: string | null = null;
  try {
    const body = (await req.json()) as { syncFrom?: string };
    syncFrom = body.syncFrom?.trim() || null;
  } catch {
    /* empty body OK for incremental sync */
  }

  try {
    const result = await runKsefSync(syncFrom);
    return jsonData(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Synchronizacja KSeF nie powiodła się.";
    return jsonError(msg, 500);
  }
}
