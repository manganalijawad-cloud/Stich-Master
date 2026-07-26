/**
 * Supabase Auth JWT verification — isolated from the business database.
 * Supports:
 * - Legacy HS256 tokens via SUPABASE_JWT_SECRET (fully offline)
 * - Asymmetric ES256/RS256 tokens via the project JWKS (cached for offline)
 */

import fs from "fs";
import path from "path";
import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWTPayload,
  type JSONWebKeySet,
} from "jose";

export interface SupabaseJwtClaims {
  sub: string;
  email?: string;
  role?: string;
  aud?: string | string[];
  exp?: number;
}

const JWKS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ASYMMETRIC_ALGS = new Set(["ES256", "RS256", "EdDSA"]);

let cachedJwks: { keys: JSONWebKeySet; fetchedAt: number } | null = null;

function getSupabaseUrl(): string | null {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  return url || null;
}

function getJwtSecret(): Uint8Array | null {
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

function getIssuer(): string | null {
  const url = getSupabaseUrl();
  if (!url) return null;
  return `${url}/auth/v1`;
}

function getJwksCachePath(): string | null {
  const electronUserData = process.env.ELECTRON_USER_DATA?.trim();
  const dir = electronUserData
    ? path.join(electronUserData, "data")
    : path.join(process.cwd(), "data");
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "supabase-jwks.json");
  } catch {
    return null;
  }
}

function readDiskJwks(): JSONWebKeySet | null {
  const cachePath = getJwksCachePath();
  if (!cachePath || !fs.existsSync(cachePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
      keys?: JSONWebKeySet["keys"];
      fetchedAt?: number;
    };
    if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) return null;
    const fetchedAt = typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0;
    cachedJwks = { keys: { keys: parsed.keys }, fetchedAt };
    return cachedJwks.keys;
  } catch {
    return null;
  }
}

function writeDiskJwks(jwks: JSONWebKeySet): void {
  const cachePath = getJwksCachePath();
  if (!cachePath) return;
  try {
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ keys: jwks.keys, fetchedAt: Date.now() }, null, 0),
      "utf8"
    );
  } catch {
    // ignore cache write failures
  }
}

async function fetchRemoteJwks(): Promise<JSONWebKeySet | null> {
  const url = getSupabaseUrl();
  if (!url) return null;
  try {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`);
    if (!res.ok) {
      console.error(`[auth] JWKS fetch failed: HTTP ${res.status}`);
      return null;
    }
    const jwks = (await res.json()) as JSONWebKeySet;
    if (!Array.isArray(jwks.keys) || jwks.keys.length === 0) {
      console.error("[auth] JWKS response contained no keys");
      return null;
    }
    cachedJwks = { keys: jwks, fetchedAt: Date.now() };
    writeDiskJwks(jwks);
    return jwks;
  } catch (err) {
    console.error("[auth] JWKS fetch error:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function resolveJwks(forceRefresh = false): Promise<JSONWebKeySet | null> {
  if (
    !forceRefresh &&
    cachedJwks &&
    Date.now() - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS
  ) {
    return cachedJwks.keys;
  }

  const remote = await fetchRemoteJwks();
  if (remote) return remote;

  if (cachedJwks) return cachedJwks.keys;
  return readDiskJwks();
}

function claimsFromPayload(payload: JWTPayload): SupabaseJwtClaims | null {
  const sub = typeof payload.sub === "string" ? payload.sub : null;
  if (!sub) return null;
  return {
    sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    role: typeof payload.role === "string" ? payload.role : undefined,
    aud: payload.aud,
    exp: typeof payload.exp === "number" ? payload.exp : undefined,
  };
}

function verifyOptions() {
  const issuer = getIssuer();
  return {
    audience: "authenticated",
    ...(issuer ? { issuer } : {}),
  } as const;
}

async function verifyHs256(token: string): Promise<SupabaseJwtClaims | null> {
  const secret = getJwtSecret();
  if (!secret) return null;
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      ...verifyOptions(),
    });
    return claimsFromPayload(payload);
  } catch {
    return null;
  }
}

async function verifyAsymmetric(token: string): Promise<SupabaseJwtClaims | null> {
  let jwks = await resolveJwks(false);
  if (!jwks) return null;

  const tryVerify = async (keys: JSONWebKeySet) => {
    const keySet = createLocalJWKSet(keys);
    const { payload } = await jwtVerify(token, keySet, verifyOptions());
    return claimsFromPayload(payload);
  };

  try {
    return await tryVerify(jwks);
  } catch (firstErr) {
    // Kid rotated or stale cache — refresh once when online.
    const refreshed = await resolveJwks(true);
    if (!refreshed || refreshed === jwks) {
      console.error(
        "[auth] Asymmetric JWT verify failed:",
        firstErr instanceof Error ? firstErr.message : firstErr
      );
      return null;
    }
    try {
      return await tryVerify(refreshed);
    } catch (secondErr) {
      console.error(
        "[auth] Asymmetric JWT verify failed after JWKS refresh:",
        secondErr instanceof Error ? secondErr.message : secondErr
      );
      return null;
    }
  }
}

/** Verify a Supabase access token (HS256 secret and/or JWKS). */
export async function verifySupabaseAccessToken(token: string): Promise<SupabaseJwtClaims | null> {
  if (!token || typeof token !== "string") return null;
  // Opaque local device tokens are not Supabase JWTs
  if (token.startsWith("hddev_")) return null;

  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    return null;
  }

  if (alg && ASYMMETRIC_ALGS.has(alg)) {
    return verifyAsymmetric(token);
  }

  if (alg === "HS256" || !alg) {
    const hs = await verifyHs256(token);
    if (hs) return hs;
    // Some projects still mint HS256 while JWKS is also published — try JWKS only if HS failed
    // and no secret is configured (misconfigured legacy).
    if (!getJwtSecret()) {
      return verifyAsymmetric(token);
    }
  }

  // Unknown alg: try JWKS then HS256
  const asymmetric = await verifyAsymmetric(token);
  if (asymmetric) return asymmetric;
  return verifyHs256(token);
}

export function isSupabaseAuthConfigured(): boolean {
  // Asymmetric (ES256) projects verify via JWKS using the project URL.
  // Legacy HS256 also works when SUPABASE_JWT_SECRET is set.
  return !!(process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim());
}
