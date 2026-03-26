import { Decimal } from "@prisma/client/runtime/library";
import { NextResponse } from "next/server";

function serialize(data: unknown): unknown {
  if (data instanceof Decimal) return data.toString();
  if (data instanceof Date) return data.toISOString();
  if (Array.isArray(data)) return data.map(serialize);
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      out[k] = serialize(o[k]);
    }
    return out;
  }
  return data;
}

export function jsonData(data: unknown, init?: ResponseInit) {
  return NextResponse.json(serialize(data), init);
}
