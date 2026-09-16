import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { gateBypassed, hasValidAuth } from "./lib/auth/token";

// Next 16 renamed `middleware.ts` to `proxy.ts`. This wraps the next-intl
// locale middleware with a shared-token authentication gate that covers ONLY
// the document-upload flow: the upload wizard pages and the API routes that
// accept uploaded files or start an analysis from them. Every other page and
// API route (pilot-country dashboards, briefings, chat, viewing a finished
// analysis, analytics) is open. See src/lib/auth/token.ts for the token model.

const intlMiddleware = createMiddleware(routing);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
// Static assets are matched by extension INSIDE the middleware (below) rather
// than excluded by the matcher regex. A regex exclusion for dotted paths would
// also skip auth for dynamic route segments that contain a dot
// (e.g. /api/ratings/us.test, /en/analysis/x.y) — an auth-gate bypass.
const STATIC_EXT_RE =
  /\.(?:js|mjs|css|png|jpg|jpeg|gif|svg|ico|webp|avif|woff|woff2|ttf|eot|map|xml|txt|webmanifest)$/i;

// API routes that ingest uploaded documents or spend LLM budget on them.
// `/api/analyze` is the exact POST that starts a run; `/api/analyze/<id>/status`
// (polling a run that already started) stays open, like viewing the result.
const GATED_API_PATHS = new Set([
  "/api/extract",
  "/api/parse-btr",
  "/api/parse-excel-targets",
  "/api/analyze",
  "/api/extraction-review",
]);

// Upload wizard pages: /upload, /es/upload, /mn/upload, /panama/upload,
// /es/panama/upload. Matching on the trailing segment keeps every locale and
// country variant covered without enumerating them.
const UPLOAD_PAGE_RE = /^(?:\/[^/]+){0,2}\/upload\/?$/;

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isAnalyticsPath(pathname: string): boolean {
  return pathname === "/analytics" || pathname.startsWith("/analytics/");
}

/** True for the upload wizard and the API routes it calls. */
export function isGatedPath(pathname: string): boolean {
  const normalised = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (GATED_API_PATHS.has(normalised)) return true;
  return UPLOAD_PAGE_RE.test(pathname);
}

// The hostnames this request was addressed to, as the browser saw them.
// Behind a reverse proxy (Azure App Service) `req.nextUrl.host` is the
// container's listen address (localhost:3000), not the public hostname, so
// comparing Origin against it rejected every same-origin browser POST in
// production. Host and X-Forwarded-Host are what the proxy forwards; a
// cross-site page cannot set either from the browser.
function requestHosts(req: NextRequest): Set<string> {
  const hosts = new Set<string>();
  const forwarded = req.headers.get("x-forwarded-host");
  if (forwarded) hosts.add(forwarded.split(",")[0].trim().toLowerCase());
  const host = req.headers.get("host");
  if (host) hosts.add(host.trim().toLowerCase());
  hosts.add(req.nextUrl.host.toLowerCase());
  return hosts;
}

// CSRF defence-in-depth: reject cross-site state-changing requests to the API.
// The SameSite=Lax session cookie already blocks cross-site POSTs; this also
// covers Bearer-authenticated clients. Same-origin browsers send a matching
// Origin; non-browser clients (curl) omit it and are allowed.
function isCrossSiteMutation(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method)) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return !requestHosts(req).has(new URL(origin).host.toLowerCase());
  } catch {
    return true;
  }
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static assets: pass through without an auth check (identified by extension,
  // not by a matcher regex — see STATIC_EXT_RE).
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/_vercel/") ||
    STATIC_EXT_RE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const api = isApiPath(pathname);
  const analytics = isAnalyticsPath(pathname);

  if (api && isCrossSiteMutation(req)) {
    return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
  }

  if (isGatedPath(pathname) && !gateBypassed()) {
    if (!(await hasValidAuth(req))) {
      if (api) {
        return NextResponse.json({ error: "Authentication required" }, { status: 401 });
      }
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // API and analytics are outside the locale tree — pass them straight through.
  if (api || analytics) {
    return NextResponse.next();
  }
  // Everything else goes through next-intl locale routing.
  return intlMiddleware(req);
}

export const config = {
  // Run on everything except Next/Vercel internals. Static files are passed
  // through by extension INSIDE the middleware (STATIC_EXT_RE) — we deliberately
  // do NOT exclude dotted paths here, because that skipped auth for dynamic
  // route segments containing a dot (an auth-gate bypass).
  matcher: ["/((?!_next|_vercel).*)"],
};
