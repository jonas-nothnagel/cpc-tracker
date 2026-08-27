import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_COOKIE_MAX_AGE,
  cookieValue,
  verifyToken,
} from "@/lib/auth/token";

// Public (pre-auth) endpoint: exchange the shared access token for an
// `app_auth` session cookie. Whitelisted in the middleware gate (src/proxy.ts).

const MAX_BODY_BYTES = 4096;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }

  let token = "";
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    }
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = JSON.parse(text) as { token?: unknown };
      token = typeof body.token === "string" ? body.token : "";
    } else {
      token = new URLSearchParams(text).get("token") ?? "";
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!(await verifyToken(token))) {
    return NextResponse.json({ error: "Invalid access token" }, { status: 401 });
  }

  const value = await cookieValue();
  if (!value) {
    return NextResponse.json(
      { error: "Access control is not configured on the server" },
      { status: 500 },
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, value, { ...cookieOptions(), maxAge: AUTH_COOKIE_MAX_AGE });
  return res;
}

// Logout: clear the session cookie.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return res;
}
