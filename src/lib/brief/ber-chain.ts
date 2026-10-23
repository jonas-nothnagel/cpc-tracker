/**
 * The official chain of a country's expenditure review (step 3 of the BER
 * plan), python/output/{country}/ber_chain.json: each national target of the
 * country's 7th National Report (NR7) to the CBD, with its reported progress,
 * and the budget lines it meets through a target of the Global Biodiversity
 * Framework (GBF), the line's expenditure type read by two AI models.
 *
 * Display only; server side. The shape is in ./ber-chain-shared for the
 * browser.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { parseBerChain, type BerChain } from "./ber-chain-shared";

export { parseBerChain, type BerChain, type ChainTarget } from "./ber-chain-shared";

const cache = new Map<string, { mtime: number; value: BerChain | null }>();

/** Server side only: the country's chain, re-read when it changes. */
export function loadBerChain(countryId: string): BerChain | null {
  const path = join(process.cwd(), "python", "output", countryId, "ber_chain.json");
  if (!existsSync(path)) return null;
  const mtime = statSync(path).mtimeMs;
  const hit = cache.get(path);
  if (hit && hit.mtime === mtime) return hit.value;
  const value = parseBerChain(JSON.parse(readFileSync(path, "utf8")));
  cache.set(path, { mtime, value });
  return value;
}
