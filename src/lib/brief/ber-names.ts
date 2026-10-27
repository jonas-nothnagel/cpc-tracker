/**
 * Display names for a country's budget lines, kept beside its Biodiversity
 * Expenditure Review in python/data/{country}-ber-names.json, by the line's
 * code: Panama's own names with their abbreviations written out (es) and
 * their translations (en); Mongolia's names and descriptions in Mongolian
 * (mn), the review's own, a machine translation marked where the review gives
 * none (`mnDescriptionMachine`). Display only: the pipeline never reads them,
 * and a line the file does not name keeps the review's name. Server side; the
 * shape and the name choice live in ./ber-names-shared for the browser.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parseBerNames, type BerNames } from "./ber-names-shared";

export { parseBerNames, shownName, type BerName, type BerNames } from "./ber-names-shared";

const cache = new Map<string, { mtime: number; value: BerNames | null }>();

/** Server side only: the country's names file, re-read when it changes. */
export function loadBerNames(countryId: string): BerNames | null {
  const path = join(process.cwd(), "python", "data", `${countryId}-ber-names.json`);
  if (!existsSync(path)) return null;
  const mtime = statSync(path).mtimeMs;
  const hit = cache.get(path);
  if (hit && hit.mtime === mtime) return hit.value;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // A half-written or hand-edited file leaves the review's own names.
    return null;
  }
  const value = parseBerNames(raw);
  cache.set(path, { mtime, value });
  return value;
}
