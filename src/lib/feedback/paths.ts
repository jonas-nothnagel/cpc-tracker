import { join } from "path";

/**
 * Resolve the per-country feedback ledger file path.
 *
 * Reuses CPC_LEDGER_DIR (set on Azure to the persistent /home/cpc/output
 * mount, same as the footprint ledger) rather than introducing a second
 * storage env var; falls back to the repo-relative python/output directory
 * when run locally. Server-only (uses process.cwd()).
 *
 * The feedback/ subdirectory is deliberately excluded from git, the Docker
 * image, and start.sh's demo-country re-sync: it exists only on the
 * persistent volume so deploys can never wipe live feedback.
 */

/** Canonical country ids only; this string becomes a path segment. */
const COUNTRY_SEGMENT = /^[a-z0-9_-]{1,32}$/;

export function feedbackPath(countryId: string): string {
  if (!COUNTRY_SEGMENT.test(countryId)) {
    throw new Error(`feedbackPath: invalid country id ${JSON.stringify(countryId)}`);
  }
  const root = process.env.CPC_LEDGER_DIR;
  const base =
    root && root.length > 0 ? root : join(process.cwd(), "python", "output");
  return join(base, "feedback", `${countryId}.jsonl`);
}
