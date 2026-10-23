/**
 * The policy area of each budget line of a country's expenditure review
 * (step 2 of the BER plan), joined from two files:
 *
 *   - python/output/{country}/ber_areas_{lens}.json: two AI models' readings
 *     of each line, and the area the line takes until a person checks it
 *     (none where the models differ or no area reaches the relevance mark);
 *   - python/data/{country}-ber-areas.json: a person's calls, with who and
 *     when. Only these count as checked.
 *
 * Display only; server side.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

export type AreaStatus = "checked" | "ai" | "apart";

export interface LineArea {
  /** The area the line counts under, or null while it is kept apart. */
  area: string | null;
  status: AreaStatus;
  /** Why the line is kept apart, while it is. */
  apart?: "models-differ" | "no-clear-area" | "none-fits";
  /** The first model's reason for its top area. */
  reason?: string;
  /** Who checked the line, and when. */
  checkedBy?: string;
  checkedAt?: string;
}

export interface BerAreas {
  lens: string;
  lines: Record<string, LineArea>;
}

interface Reading {
  code?: unknown;
  area?: unknown;
  status?: unknown;
  first?: { ranked?: { reasoning?: unknown }[] };
}

interface Call {
  call?: unknown;
  area?: unknown;
  by?: unknown;
  at?: unknown;
}

/** One status per line: a person's call wins; then the models' joint area. */
export function parseBerAreas(readings: unknown, calls: unknown, lens: string): BerAreas | null {
  const lines = (readings as { lines?: unknown } | null)?.lines;
  if (!Array.isArray(lines)) return null;
  const decided = ((calls as Record<string, unknown> | null)?.[lens] ?? {}) as Record<string, Call>;
  const out: BerAreas["lines"] = {};
  for (const raw of lines as Reading[]) {
    if (typeof raw?.code !== "string") continue;
    const reason = raw.first?.ranked?.[0]?.reasoning;
    const base = typeof reason === "string" && reason ? { reason } : {};
    const call = decided[raw.code];
    if (call && (call.call === "accept" || call.call === "change" || call.call === "none")) {
      const by = typeof call.by === "string" ? { checkedBy: call.by } : {};
      const at = typeof call.at === "string" ? { checkedAt: call.at } : {};
      out[raw.code] =
        call.call === "none" || typeof call.area !== "string"
          ? { area: null, status: "apart", apart: "none-fits", ...base, ...by, ...at }
          : { area: call.area, status: "checked", ...base, ...by, ...at };
      continue;
    }
    if (typeof raw.area === "string" && raw.area) {
      out[raw.code] = { area: raw.area, status: "ai", ...base };
    } else {
      const apart = raw.status === "models-differ" ? "models-differ" : "no-clear-area";
      out[raw.code] = { area: null, status: "apart", apart, ...base };
    }
  }
  return { lens, lines: out };
}

const cache = new Map<string, { stamp: string; value: BerAreas | null }>();

function stampOf(paths: string[]): string {
  return paths.map((p) => (existsSync(p) ? String(statSync(p).mtimeMs) : "-")).join("|");
}

/** Server side only: the country's line areas in a lens, re-read when either file changes. */
export function loadBerAreas(countryId: string, lens = "globe"): BerAreas | null {
  const readingsPath = join(process.cwd(), "python", "output", countryId, `ber_areas_${lens}.json`);
  const callsPath = join(process.cwd(), "python", "data", `${countryId}-ber-areas.json`);
  if (!existsSync(readingsPath)) return null;
  const key = `${readingsPath}|${callsPath}`;
  const stamp = stampOf([readingsPath, callsPath]);
  const hit = cache.get(key);
  if (hit && hit.stamp === stamp) return hit.value;
  const readings = JSON.parse(readFileSync(readingsPath, "utf8"));
  const calls = existsSync(callsPath) ? JSON.parse(readFileSync(callsPath, "utf8")) : null;
  const value = parseBerAreas(readings, calls, lens);
  cache.set(key, { stamp, value });
  return value;
}
