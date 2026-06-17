import { createPublicKey, publicEncrypt, constants } from "node:crypto";
import { getKsefConfig } from "./config";

type AuthChallengeResponse = {
  challenge: string;
  timestamp: string;
  timestampMs: number;
};

type PublicKeyCertificate = {
  certificate: string;
  publicKeyId: string;
  usage: string[];
};

type TokenWrapper = {
  token: string;
  validUntil: string;
};

type AuthKsefTokenResponse = {
  referenceNumber: string;
  authenticationToken: TokenWrapper;
};

type AuthStatusResponse = {
  status: { code: number; description: string };
};

type RedeemTokenResponse = {
  accessToken: TokenWrapper;
  refreshToken: TokenWrapper;
};

type RefreshTokenResponse = {
  accessToken: TokenWrapper;
};

type SessionCache = {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

const EXPIRY_SKEW_MS = 60_000;
const AUTH_POLL_INTERVAL_MS = 1_000;
const AUTH_POLL_MAX_ATTEMPTS = 90;

let sessionCache: SessionCache | null = null;
let authInFlight: Promise<SessionCache> | null = null;

export type KsefAuthDiagnostics = {
  ksefTokenConfigured: boolean;
  ksefTokenLength: number | null;
  deprecatedAccessTokenEnvSet: boolean;
  accessSessionActive: boolean;
  accessExpiresAt: string | null;
};

function apiHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-Error-Format": "problem-details",
    ...extra,
  };
}

function parseValidUntil(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    throw new Error("KSeF auth: nieprawidłowa data ważności tokena.");
  }
  return d;
}

async function readKsefProblem(res: Response, context: string): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { detail?: string; title?: string };
    const line = j.detail || j.title;
    if (line) return `${context}: ${res.status} ${line}`;
  } catch {
    /* ignore */
  }
  return `${context}: ${res.status} ${res.statusText}${text ? ` — ${text.slice(0, 300)}` : ""}`;
}

async function fetchAuthChallenge(baseUrl: string): Promise<AuthChallengeResponse> {
  const res = await fetch(`${baseUrl}/auth/challenge`, {
    method: "POST",
    headers: apiHeaders(),
  });
  if (!res.ok) {
    throw new Error(await readKsefProblem(res, "KSeF auth challenge"));
  }
  const json = (await res.json()) as AuthChallengeResponse;
  if (!json.challenge || json.timestampMs == null) {
    throw new Error("KSeF auth: nieoczekiwana odpowiedź challenge.");
  }
  return json;
}

async function fetchKsefTokenEncryptionCert(baseUrl: string): Promise<PublicKeyCertificate> {
  const res = await fetch(`${baseUrl}/security/public-key-certificates`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(await readKsefProblem(res, "KSeF public key"));
  }
  const certs = (await res.json()) as PublicKeyCertificate[];
  if (!Array.isArray(certs)) {
    throw new Error("KSeF auth: nieoczekiwana odpowiedź public-key-certificates.");
  }
  const now = Date.now();
  const match = certs.find(
    (c) => Boolean(c.certificate && c.publicKeyId && c.usage?.includes("KsefTokenEncryption")),
  );
  if (!match) {
    throw new Error("KSeF auth: brak certyfikatu KsefTokenEncryption.");
  }
  const validTo = (match as PublicKeyCertificate & { validTo?: string }).validTo;
  if (validTo) {
    const expires = new Date(validTo).getTime();
    if (!Number.isNaN(expires) && expires < now) {
      throw new Error("KSeF auth: certyfikat KsefTokenEncryption wygasł.");
    }
  }
  return match;
}

function encryptKsefToken(
  ksefToken: string,
  timestampMs: number,
  certificateBase64: string,
): string {
  const pem = `-----BEGIN CERTIFICATE-----\n${certificateBase64.match(/.{1,64}/g)?.join("\n") ?? certificateBase64}\n-----END CERTIFICATE-----`;
  const publicKey = createPublicKey(pem);
  const plaintext = `${ksefToken}|${timestampMs}`;
  const encrypted = publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(plaintext, "utf8"),
  );
  return encrypted.toString("base64");
}

async function submitKsefTokenAuth(
  baseUrl: string,
  challenge: AuthChallengeResponse,
  nip: string,
  encryptedToken: string,
  publicKeyId: string,
): Promise<AuthKsefTokenResponse> {
  const res = await fetch(`${baseUrl}/auth/ksef-token`, {
    method: "POST",
    headers: apiHeaders(),
    body: JSON.stringify({
      challenge: challenge.challenge,
      contextIdentifier: { type: "Nip", value: nip },
      encryptedToken,
      publicKeyId,
    }),
  });
  if (!res.ok) {
    throw new Error(await readKsefProblem(res, "KSeF auth ksef-token"));
  }
  const json = (await res.json()) as AuthKsefTokenResponse;
  if (!json.referenceNumber || !json.authenticationToken?.token) {
    throw new Error("KSeF auth: nieoczekiwana odpowiedź ksef-token.");
  }
  return json;
}

async function pollAuthStatus(
  baseUrl: string,
  referenceNumber: string,
  authenticationToken: string,
): Promise<void> {
  for (let attempt = 0; attempt < AUTH_POLL_MAX_ATTEMPTS; attempt += 1) {
    const res = await fetch(`${baseUrl}/auth/${encodeURIComponent(referenceNumber)}`, {
      method: "GET",
      headers: apiHeaders({ Authorization: `Bearer ${authenticationToken}` }),
    });
    if (!res.ok) {
      throw new Error(await readKsefProblem(res, "KSeF auth status"));
    }
    const json = (await res.json()) as AuthStatusResponse;
    const code = json.status?.code;
    if (code === 200) return;
    if (code === 100) {
      await new Promise((r) => setTimeout(r, AUTH_POLL_INTERVAL_MS));
      continue;
    }
    const desc = json.status?.description ?? "nieznany błąd";
    if (code === 450) {
      throw new Error(
        `KSeF auth: uwierzytelnianie nieudane (${code}: ${desc}). ` +
          "Najczęstsza przyczyna: token wygenerowany w innym środowisku niż KSEF_API_BASE_URL " +
          "(token z produkcji wymaga https://api.ksef.mf.gov.pl/v2; token testowy — api-test; demo — api-demo).",
      );
    }
    throw new Error(`KSeF auth: uwierzytelnianie nieudane (${code}: ${desc}).`);
  }
  throw new Error("KSeF auth: przekroczono czas oczekiwania na uwierzytelnienie.");
}

async function redeemTokens(
  baseUrl: string,
  authenticationToken: string,
): Promise<SessionCache> {
  const res = await fetch(`${baseUrl}/auth/token/redeem`, {
    method: "POST",
    headers: apiHeaders({ Authorization: `Bearer ${authenticationToken}` }),
  });
  if (!res.ok) {
    throw new Error(await readKsefProblem(res, "KSeF auth redeem"));
  }
  const json = (await res.json()) as RedeemTokenResponse;
  if (!json.accessToken?.token || !json.refreshToken?.token) {
    throw new Error("KSeF auth: nieoczekiwana odpowiedź redeem.");
  }
  return {
    accessToken: json.accessToken.token,
    accessTokenExpiresAt: parseValidUntil(json.accessToken.validUntil),
    refreshToken: json.refreshToken.token,
    refreshTokenExpiresAt: parseValidUntil(json.refreshToken.validUntil),
  };
}

async function refreshAccessToken(baseUrl: string, refreshToken: string): Promise<SessionCache> {
  const res = await fetch(`${baseUrl}/auth/token/refresh`, {
    method: "POST",
    headers: apiHeaders({ Authorization: `Bearer ${refreshToken}` }),
  });
  if (!res.ok) {
    throw new Error(await readKsefProblem(res, "KSeF auth refresh"));
  }
  const json = (await res.json()) as RefreshTokenResponse;
  if (!json.accessToken?.token) {
    throw new Error("KSeF auth: nieoczekiwana odpowiedź refresh.");
  }
  const prev = sessionCache;
  return {
    accessToken: json.accessToken.token,
    accessTokenExpiresAt: parseValidUntil(json.accessToken.validUntil),
    refreshToken: prev?.refreshToken ?? refreshToken,
    refreshTokenExpiresAt:
      prev?.refreshTokenExpiresAt ?? parseValidUntil(json.accessToken.validUntil),
  };
}

async function authenticateWithKsefToken(): Promise<SessionCache> {
  const cfg = getKsefConfig();
  const ksefToken = cfg.ksefToken;
  const nip = cfg.companyTaxId;
  if (!ksefToken) {
    throw new Error(
      "KSeF API: brak KSEF_KSEF_TOKEN (token z Aplikacji Podatnika). KSEF_ACCESS_TOKEN nie jest już używany jako Bearer.",
    );
  }
  if (!nip) {
    throw new Error("KSeF API: brak KSEF_COMPANY_TAX_ID (NIP kontekstu uwierzytelnienia).");
  }

  const base = cfg.apiBaseUrl.replace(/\/+$/, "");
  const challenge = await fetchAuthChallenge(base);
  const cert = await fetchKsefTokenEncryptionCert(base);
  const encryptedToken = encryptKsefToken(ksefToken, challenge.timestampMs, cert.certificate);
  const authStart = await submitKsefTokenAuth(
    base,
    challenge,
    nip,
    encryptedToken,
    cert.publicKeyId,
  );
  await pollAuthStatus(base, authStart.referenceNumber, authStart.authenticationToken.token);
  return redeemTokens(base, authStart.authenticationToken.token);
}

/** Czyści cache JWT — np. po 401 z API metadanych. */
export function clearKsefAccessCache(): void {
  sessionCache = null;
}

/** Diagnostyka sesji — bez wartości tokenów. */
export function getKsefAuthDiagnostics(): KsefAuthDiagnostics {
  const cfg = getKsefConfig();
  const token = cfg.ksefToken;
  const now = Date.now();
  const active =
    sessionCache != null &&
    sessionCache.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS > now;

  return {
    ksefTokenConfigured: Boolean(token),
    ksefTokenLength: token ? token.length : null,
    deprecatedAccessTokenEnvSet:
      Boolean(process.env.KSEF_ACCESS_TOKEN?.trim()) &&
      !Boolean(process.env.KSEF_KSEF_TOKEN?.trim()),
    accessSessionActive: active,
    accessExpiresAt: active ? sessionCache!.accessTokenExpiresAt.toISOString() : null,
  };
}

/**
 * Zwraca ważny JWT accessToken (cache → refresh → pełny auth flow).
 */
export async function ensureValidAccessToken(): Promise<string> {
  const cfg = getKsefConfig();
  if (!cfg.ksefToken) {
    throw new Error(
      "KSeF API: brak KSEF_KSEF_TOKEN. Ustaw token z Aplikacji Podatnika (nie JWT accessToken).",
    );
  }

  const now = Date.now();
  if (
    sessionCache &&
    sessionCache.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS > now
  ) {
    return sessionCache.accessToken;
  }

  if (
    sessionCache &&
    sessionCache.refreshTokenExpiresAt.getTime() > now
  ) {
    try {
      const base = cfg.apiBaseUrl.replace(/\/+$/, "");
      sessionCache = await refreshAccessToken(base, sessionCache.refreshToken);
      return sessionCache.accessToken;
    } catch {
      sessionCache = null;
    }
  }

  if (!authInFlight) {
    authInFlight = authenticateWithKsefToken()
      .then((s) => {
        sessionCache = s;
        return s;
      })
      .finally(() => {
        authInFlight = null;
      });
  }

  const session = await authInFlight;
  return session.accessToken;
}
