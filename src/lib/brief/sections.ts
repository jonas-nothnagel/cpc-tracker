import type { SectionId } from "./selection";

/** Height of each section in quarter-page units of an A4 sheet; 0 for a
 *  section shown on screen only. */
export const SECTION_UNITS: Record<SectionId, 0 | 1 | 2> = {
  overall: 1,
  together: 2,
  aligned: 2,
  apart: 2,
  commitments: 2,
  documents: 2,
  areas: 2,
  contracts: 0,
};

/** Content height of one A4 sheet, in units. */
export const PAGE_UNITS = 4;
/** The title block opening page 1. */
export const TITLE_UNITS = 1;

export interface BriefPage {
  /** Page 1 opens with the title block. */
  title: boolean;
  sections: SectionId[];
}

/**
 * Lay sections out on A4 sheets in the chosen order: a section that does not
 * fit the space left on a page starts the next one. The order is the
 * reader's choice, so nothing is moved forward to fill a gap. Sections shown
 * on screen only take no space.
 */
export function paginate(sections: SectionId[]): BriefPage[] {
  const pages: BriefPage[] = [{ title: true, sections: [] }];
  let free = PAGE_UNITS - TITLE_UNITS;
  for (const id of sections) {
    const units = SECTION_UNITS[id];
    if (units === 0) continue;
    if (units > free) {
      pages.push({ title: false, sections: [] });
      free = PAGE_UNITS;
    }
    pages[pages.length - 1].sections.push(id);
    free -= units;
  }
  return pages;
}
