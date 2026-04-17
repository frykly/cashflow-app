import { jsonData } from "@/lib/api/json-response";
import { getKsefStatusResponse } from "@/lib/ksef/diagnostics";

export const runtime = "nodejs";

export async function GET() {
  const body = await getKsefStatusResponse();
  return jsonData(body);
}
