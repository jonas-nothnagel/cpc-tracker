import { readFileSync } from "fs";
import { join } from "path";
import { localizeCategories } from "@/data/category-translations";
import type { LensId } from "@/lib/brief/source";

/** The published category lists, as every upload's run copies them. */
export const PUBLISHED_CATEGORIES = join(process.cwd(), "python", "data", "categories.json");

/** Each published set by its brief id, and its key in the category file. */
const SETS: [LensId, string][] = [
  ["globe", "globe_categories"],
  ["ipcc", "ipcc_sectors"],
  ["gga", "gga_categories"],
  ["hr", "hr_categories"],
];

/** A published set of policy areas and the names of its areas. */
export interface PublishedLens {
  id: LensId;
  areas: string[];
}

/**
 * The four sets every upload's run classifies its targets in, with their
 * areas named as the brief names them (the page's language where a
 * translation is kept, English otherwise). Server only: it reads the file.
 */
export function publishedLenses(locale: string, file = PUBLISHED_CATEGORIES): PublishedLens[] {
  const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, { id: string; name: string }[]>;
  return SETS.map(([id, key]) => ({ id, areas: localizeCategories(data[key] ?? [], locale).map((c) => c.name) }));
}
