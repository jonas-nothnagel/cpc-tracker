// Mirror of the pipeline's active classification taxonomies
// (python/src/config.py, ACTIVE_TAXONOMIES). Decision 2026-07-03: IPCC
// sectors, GLOBE, and GGA only; NBS is paused until the taxonomy strategy
// is revisited. The upload wizard reads this so users are not asked to
// curate categories the pipeline will not classify against, and so the
// pre-run call estimate matches the actual call plan. Display surfaces are
// unaffected: they derive lenses from whatever taxonomies exist in a
// country's classification data (older outputs still carry `nbs` records).
export const ACTIVE_TAXONOMIES = ["sector", "globe", "gga"] as const;

export const isTaxonomyActive = (id: string): boolean =>
  (ACTIVE_TAXONOMIES as readonly string[]).includes(id);

// The GGA lens is the seven thematic targets of the UAE Framework for
// Global Climate Resilience (decision 2/CMA.5, paragraph 9). Fixed size and
// not user-curated, so only its count is needed for the call estimate.
export const GGA_CATEGORY_COUNT = 7;
