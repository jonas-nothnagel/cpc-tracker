import { join } from "path";

/**
 * Resolve analytics ledger file paths.
 *
 * Reuses CPC_LEDGER_DIR (set on Azure to the persistent /home/cpc/output
 * mount, same as the footprint and feedback ledgers); falls back to the
 * repo-relative python/output directory when run locally. Server-only
 * (uses process.cwd()).
 *
 * Files rotate monthly (events-YYYY-MM.jsonl): the writer derives the name
 * from the current UTC date, so there is no rename step and no rotation
 * race; the dashboard reads only the months in range; retention is deleting
 * old files. The analytics/ subdirectory is excluded from git, the Docker
 * image, and start.sh's demo-country re-sync, exactly like feedback/: it
 * exists only on the persistent volume so deploys can never wipe live data.
 */

/** "YYYY-MM" only; this string becomes part of a filename. */
const MONTH_SEGMENT = /^\d{4}-\d{2}$/;

export function analyticsDir(): string {
  const root = process.env.CPC_LEDGER_DIR;
  const base =
    root && root.length > 0 ? root : join(process.cwd(), "python", "output");
  return join(base, "analytics");
}

export function analyticsPath(month: string): string {
  if (!MONTH_SEGMENT.test(month)) {
    throw new Error(`analyticsPath: invalid month ${JSON.stringify(month)}`);
  }
  return join(analyticsDir(), `events-${month}.jsonl`);
}

/** Current month in UTC (matches the ledgers' UTC timestamps). */
export function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

/** Months covering `count` months back from `now`, oldest first. */
export function lastMonths(count: number, now: Date = new Date()): string[] {
  const months: string[] = [];
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  for (let i = 0; i < count; i++) {
    months.unshift(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return months;
}
