import type { SectionId } from "./selection";

/** Height of each section in quarter-page units of an A4 sheet. */
export const SECTION_UNITS: Record<SectionId, 1 | 2 | 4> = {
  overall: 1,
  together: 2,
  apart: 2,
  commitments: 2,
  documents: 2,
  map: 4,
  areas: 2,
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
 * reader's choice, so nothing is moved forward to fill a gap.
 */
export function paginate(sections: SectionId[]): BriefPage[] {
  const pages: BriefPage[] = [{ title: true, sections: [] }];
  let free = PAGE_UNITS - TITLE_UNITS;
  for (const id of sections) {
    const units = SECTION_UNITS[id];
    if (units > free) {
      pages.push({ title: false, sections: [] });
      free = PAGE_UNITS;
    }
    pages[pages.length - 1].sections.push(id);
    free -= units;
  }
  return pages;
}
