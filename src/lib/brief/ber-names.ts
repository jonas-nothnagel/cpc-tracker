/**
 * Display names for a country's budget lines, kept beside its Biodiversity
 * Expenditure Review in python/data/{country}-ber-names.json, by the line's
 * code: Panama's own names with their abbreviations written out (es) and
 * their translations (en); Mongolia's names and descriptions in Mongolian
 * (mn), the review's own where it has them, else machine translations
 * (`mnMachine`). Display only: the pipeline never reads them, and a line
 * the file does not name keeps the review's name.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

export interface BerName {
  es?: string;
  en?: string;
  mn?: string;
  mnDescription?: string;
  /** The Mongolian name and description are machine translations. */
  mnMachine?: true;
  /** The Mongolian name is the review's own, its description a machine
   *  translation (the review gives none in Mongolian). */
  mnDescriptionMachine?: true;
}

export interface BerNames {
  names: Record<string, BerName>;
}

export function parseBerNames(raw: unknown): BerNames | null {
  const names = (raw as { names?: unknown } | null)?.names;
  if (!names || typeof names !== "object") return null;
  const out: BerNames["names"] = {};
  for (const [code, value] of Object.entries(names as Record<string, unknown>)) {
    const v = value as Record<string, unknown> | null;
    const text = (key: "es" | "en" | "mn" | "mnDescription") =>
      typeof v?.[key] === "string" && v[key] ? { [key]: v[key] as string } : {};
    const name: BerName = { ...text("es"), ...text("en"), ...text("mn"), ...text("mnDescription") };
    if (name.mn && v?.mnMachine === true) name.mnMachine = true;
    if (name.mnDescription && v?.mnDescriptionMachine === true) name.mnDescriptionMachine = true;
    if (name.es || name.en || name.mn) out[code] = name;
  }
  return { names: out };
}

/** The name a budget line shows in the page's language: Spanish with the
 *  review's abbreviations written out; Mongolian as the review has it, else
 *  machine-translated; any other language the English machine translation. */
export function shownName(listed: BerName | undefined, locale: string): { name: string; machine: boolean; own: boolean } | null {
  if (!listed) return null;
  if (locale === "es") return listed.es ? { name: listed.es, machine: false, own: false } : null;
  if (locale === "mn" && listed.mn) return { name: listed.mn, machine: listed.mnMachine === true, own: !listed.mnMachine };
  return listed.en ? { name: listed.en, machine: true, own: false } : null;
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
