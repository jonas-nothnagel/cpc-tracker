/**
 * Shared lens types — kept in their own module to avoid a circular type
 * import between `index.tsx` and the section files that consume the lens
 * switcher.
 */

import type { SectorCategoryRef } from "./centerpiece/wheel";

export type LensId = "globe" | "ipcc" | "country";

export interface LensOption {
  id: LensId;
  label: string;
  taxonomyType: string;
  categories: SectorCategoryRef[];
}
