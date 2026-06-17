import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { runKsefSync } from "@/lib/ksef/sync-documents";
import type { SyncRangeRequest } from "@/lib/ksef/sync-range";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: SyncRangeRequest = {};
  try {
    const raw = (await req.json()) as {
      syncFrom?: string;
      syncTo?: string;
      forceRange?: boolean;
    };
    body = {
      syncFrom: raw.syncFrom?.trim() || null,
      syncTo: raw.syncTo?.trim() || null,
      forceRange: raw.forceRange === true,
    };
  } catch {
    /* empty body OK for incremental sync */
  }

  try {
    const result = await runKsefSync(body);
    return jsonData(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Synchronizacja KSeF nie powiodła się.";
    return jsonError(msg, 500);
  }
}
