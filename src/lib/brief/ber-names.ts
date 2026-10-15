/**
 * Display names for a country's budget lines, kept beside its Biodiversity
 * Expenditure Review in python/data/{country}-ber-names.json: the review's
 * own names with their abbreviations written out (es) and their
 * translations (en), by the line's code. Display only: the pipeline never
 * reads them, and a line the file does not name keeps the review's name.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

export interface BerNames {
  names: Record<string, { es?: string; en?: string }>;
}

export function parseBerNames(raw: unknown): BerNames | null {
  const names = (raw as { names?: unknown } | null)?.names;
  if (!names || typeof names !== "object") return null;
  const out: BerNames["names"] = {};
  for (const [code, value] of Object.entries(names as Record<string, unknown>)) {
    const v = value as { es?: unknown; en?: unknown } | null;
    const es = typeof v?.es === "string" && v.es ? v.es : undefined;
    const en = typeof v?.en === "string" && v.en ? v.en : undefined;
    if (es || en) out[code] = { ...(es ? { es } : {}), ...(en ? { en } : {}) };
  }
  return { names: out };
}

const cache = new Map<string, { mtime: number; value: BerNames | null }>();

/** Server side only: the country's names file, re-read when it changes. */
export function loadBerNames(countryId: string): BerNames | null {
  const path = join(process.cwd(), "python", "data", `${countryId}-ber-names.json`);
  if (!existsSync(path)) return null;
  const mtime = statSync(path).mtimeMs;
  const hit = cache.get(path);
  if (hit && hit.mtime === mtime) return hit.value;
  const value = parseBerNames(JSON.parse(readFileSync(path, "utf8")));
  cache.set(path, { mtime, value });
  return value;
}
