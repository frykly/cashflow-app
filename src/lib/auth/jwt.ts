import * as jose from "jose";
import { SESSION_MAX_AGE_SEC } from "@/lib/auth/constants";

export type SessionPayload = {
  sub: string;
  email: string;
  role: string;
};

function getSecretKey(): Uint8Array | null {
  const raw = process.env.AUTH_SECRET?.trim();
  if (!raw || raw.length < 32) return null;
  return new TextEncoder().encode(raw);
}

function requireSecretKey(): Uint8Array {
  const secret = getSecretKey();
  if (!secret) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters.");
  }
  return secret;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  const secret = requireSecretKey();
  return new jose.SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getSecretKey();
    if (!secret) return null;
    const { payload } = await jose.jwtVerify(token, secret, { algorithms: ["HS256"] });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const email = typeof payload.email === "string" ? payload.email : "";
    const role = typeof payload.role === "string" ? payload.role : "";
    if (!sub || !email) return null;
    return { sub, email, role };
  } catch {
    return null;
  }
}
