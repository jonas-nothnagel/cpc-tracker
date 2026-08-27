// Shared-token authentication for the whole app (pages + API).
//
// A single `APP_ACCESS_TOKEN` secret is handed to admin users. Browsers
// authenticate by exchanging it for an `app_auth` cookie (see /api/auth);
// scripts/curl can pass `Authorization: Bearer <token>` directly. The gate is
// enforced in `src/proxy.ts` (middleware).
//
// Everything here uses Web Crypto (`crypto.subtle`) so it runs unchanged in the
// Edge middleware runtime AND in Node route handlers — Node's `crypto` module
// (createHash/timingSafeEqual) is not available in Edge middleware.
//
// Behaviour when `APP_ACCESS_TOKEN` is unset:
//   - development: gate is bypassed (open) so local dev needs no token;
//   - production: fail closed — every request is denied until the token is set.

import type { NextRequest } from "next/server";

export const AUTH_COOKIE = "app_auth";
/** 7 days. */
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function configuredToken(): string | undefined {
  const t = process.env.APP_ACCESS_TOKEN;
  return t && t.length > 0 ? t : undefined;
}

/** True only in development when no token is configured (gate disabled). */
export function gateBypassed(): boolean {
  return configuredToken() === undefined && process.env.NODE_ENV !== "production";
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time compare of two equal-length strings. */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** Verify a raw token against APP_ACCESS_TOKEN (constant-time over digests). */
export async function verifyToken(provided: string): Promise<boolean> {
  const token = configuredToken();
  if (!token || !provided) return false;
  const [a, b] = await Promise.all([sha256Hex(provided), sha256Hex(token)]);
  return timingSafeEqualStr(a, b);
}

/** The value stored in the `app_auth` cookie (a digest of the token). */
export async function cookieValue(): Promise<string | null> {
  const token = configuredToken();
  return token ? sha256Hex(token) : null;
}

/**
 * True when the request carries a valid credential: an `app_auth` cookie
 * matching the token digest, or an `Authorization: Bearer <token>` header.
 * Returns false when no token is configured (callers use `gateBypassed()` to
 * decide whether an unconfigured gate should be open in dev).
 */
export async function hasValidAuth(req: NextRequest): Promise<boolean> {
  const token = configuredToken();
  if (!token) return false;

  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    if (await verifyToken(authHeader.slice("Bearer ".length))) return true;
  }

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  if (cookie) {
    const expected = await sha256Hex(token);
    if (timingSafeEqualStr(cookie, expected)) return true;
  }

  return false;
}
