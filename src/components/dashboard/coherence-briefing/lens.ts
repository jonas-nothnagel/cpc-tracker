/**
 * Shared lens types — kept in their own module to avoid a circular type
 * import between `index.tsx` and the section files that consume the lens
 * switcher.
 */

import type { SectorCategoryRef } from "./centerpiece/wheel";

export type LensId = "globe" | "ipcc" | "country" | "gga" | "hr";

export interface LensOption {
  id: LensId;
  label: string;
  /** Optional hover text, e.g. to expand an acronym in the lens label on
   *  first use (abbreviation guardrail). */
  tooltip?: string;
  taxonomyType: string;
  categories: SectorCategoryRef[];
}
