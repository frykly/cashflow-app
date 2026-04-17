import { jsonData } from "@/lib/api/json-response";
import { jsonError } from "@/lib/api/errors";
import { runKsefSync } from "@/lib/ksef/sync-documents";

export const runtime = "nodejs";

export async function POST() {
  try {
    const result = await runKsefSync();
    return jsonData(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Synchronizacja KSeF nie powiodła się.";
    return jsonError(msg, 500);
  }
}
