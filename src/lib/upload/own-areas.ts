import { cleanText } from "./documents";

/**
 * Policy areas an upload brings, in the user's own words: what they must
 * hold before a run, and how two columns pasted from a spreadsheet read.
 * Client-safe, so the page and the server check the same rules.
 */

/** Policy areas the upload brings, in the user's own words. */
export interface OwnLensInput {
  name: string;
  /** Where the areas come from, shown as the lens's tooltip. */
  source?: string;
  areas: { name: string; description: string }[];
}

export const OWN_AREA_LIMITS = { name: 80, source: 300, areas: 30, areaName: 80, description: 1200 } as const;

export interface OwnLensProblem {
  code: "name" | "source" | "count" | "areaName" | "description" | "duplicate";
  /** The area the problem is about, as typed. */
  area?: string;
}

/** The first thing that stops the areas from being used, or null. */
export function ownLensProblem(lens: OwnLensInput): OwnLensProblem | null {
  const name = cleanText(lens.name);
  if (!name || name.length > OWN_AREA_LIMITS.name) return { code: "name" };
  if (cleanText(lens.source).length > OWN_AREA_LIMITS.source) return { code: "source" };
  const areas = Array.isArray(lens.areas) ? lens.areas : [];
  if (areas.length < 1 || areas.length > OWN_AREA_LIMITS.areas) return { code: "count" };
  const seen = new Set<string>();
  for (const area of areas) {
    const areaName = cleanText(area?.name);
    if (!areaName || areaName.length > OWN_AREA_LIMITS.areaName) return { code: "areaName" };
    const description = cleanText(area?.description);
    if (!description || description.length > OWN_AREA_LIMITS.description) {
      return { code: "description", area: areaName };
    }
    const key = areaName.toLocaleLowerCase();
    if (seen.has(key)) return { code: "duplicate", area: areaName };
    seen.add(key);
  }
  return null;
}

/** Areas from text pasted out of a spreadsheet: one per line, the name and
 *  the description split on a tab (as two copied columns arrive), else on
 *  the first comma. Blank lines are skipped; nothing else is guessed. */
export function parseAreas(text: string): { name: string; description: string }[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const cut = line.includes("\t") ? line.indexOf("\t") : line.indexOf(",");
      const name = cut < 0 ? line : line.slice(0, cut);
      const description = cut < 0 ? "" : line.slice(cut + 1).replace(/\t/g, " ");
      return { name: cleanText(name), description: cleanText(description) };
    });
}
