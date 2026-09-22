import { getCountry } from "@/config/countries";

/**
 * Map a concrete (locale-stripped) pathname to a fixed route pattern so raw
 * paths never reach the ledger. Unknown paths collapse to "/other" — the set
 * below is the complete vocabulary of the `route` field. Pure and
 * client-safe; the server-side validator uses the same set as its whitelist.
 */

export const ROUTE_PATTERNS = new Set([
  "/",
  "/dashboard",
  "/[country]",
  "/[country]/upload",
  "/[country]/model-comparison",
  "/[country]/model-evaluation",
  "/[country]/explore",
  "/upload",
  "/analysis/[id]",
  "/methodology",
  "/sustainability",
  "/prototypes",
  "/other",
]);

const STATIC_ROUTES = new Set([
  "/",
  "/dashboard",
  "/upload",
  "/methodology",
  "/sustainability",
  "/prototypes",
]);

/** Second path segments that resolve to a per-country sub-page pattern. */
const COUNTRY_SUBPAGES = new Set(["upload", "model-comparison", "model-evaluation", "explore"]);

export function toRoutePattern(pathname: string): string {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (STATIC_ROUTES.has(path)) return path;

  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "analysis" && segments.length === 2) {
    return "/analysis/[id]";
  }
  // Registry lookup, not the shape regex: single-segment paths that merely
  // LOOK like a country slug (e.g. a typo'd URL) must fall to /other.
  if (segments.length === 1 && getCountry(segments[0])) {
    return "/[country]";
  }
  if (
    segments.length === 2 &&
    COUNTRY_SUBPAGES.has(segments[1]) &&
    getCountry(segments[0])
  ) {
    return `/[country]/${segments[1]}`;
  }
  return "/other";
}

/** Country carried by the path itself (e.g. /panama, /panama/upload). */
export function countryFromPath(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  const pattern = toRoutePattern(pathname);
  if (pattern === "/[country]" || pattern.startsWith("/[country]/")) {
    return segments[0];
  }
  return null;
}
