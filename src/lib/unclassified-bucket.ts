/**
 * Explicit "no clear theme" bucket for ranked taxonomy lenses.
 *
 * WHY THIS EXISTS
 * `rank_classification` (python/src/classify.py) marks the highest-scoring
 * category as `isPrimary` regardless of how low that score is, and the generic
 * rank prompt never invites the model to return an empty ranking. So every
 * target receives a primary even when nothing scored above the relevance
 * threshold. Every briefing consumer groups on `isPrimary` and ignores
 * `isRelevant`, so those weak placements are silently counted as real ones.
 *
 * On the human rights lens that is not a rounding error: for Mongolia, 89 of
 * 153 policy targets (58%) have no theme at or above the threshold, yet all 89
 * are placed — 76% of the "Indigenous Peoples and local communities" row and
 * 100% of "Rights of Persons with Disabilities" are such placements. Presenting
 * them as classified overstates what the analysis found, which the project
 * guardrails exist to prevent.
 *
 * WHAT THIS DOES
 * For each configured taxonomy, a target whose records contain no `isRelevant`
 * entry is moved out of its weak primary and into a derived bucket category.
 * The bucket is display-only: it is NEVER written to `categories.json` (which is
 * a pipeline input read by `load_input_data`, so a synthetic category there
 * would be fed to the classifier as if it were source-traced) and never sent to
 * an LLM. Derived records carry `derived: true` so they are distinguishable from
 * pipeline output.
 *
 * SCOPE
 * Enabled for `hr` only. The same latent issue exists on `nbs` (31 such items)
 * and `globe` (20) for Mongolia; extending is a one-entry change to
 * `UNCLASSIFIED_TAXONOMIES`, but it moves counts on already-reviewed lenses, so
 * it should be a deliberate decision rather than a side effect of this one.
 */

/** Taxonomies that surface an explicit "no clear theme" bucket. */
export const UNCLASSIFIED_TAXONOMIES = ["hr"] as const;

/** Derived bucket category id, per taxonomy. Not a pipeline category. */
export const unclassifiedIdFor = (taxonomyType: string): string =>
  `${taxonomyType}_unclassified`;

/** True for any derived bucket category id (e.g. `hr_unclassified`). */
export const isUnclassifiedCategoryId = (categoryId: string): boolean =>
  categoryId.endsWith("_unclassified");

/**
 * English display names for the derived buckets. Project-defined UI copy, not
 * source-traced taxonomy text — deliberately factual about the analysis rather
 * than about the country: a target here may still touch the theme, the analysis
 * simply found no clear match. es/mn live in `category-translations.ts`.
 */
export const UNCLASSIFIED_NAMES: Record<string, string> = {
  hr: "No clear human rights theme",
};

export const UNCLASSIFIED_DESCRIPTIONS: Record<string, string> = {
  hr:
    "Targets where no human rights theme scored at or above the relevance " +
    "threshold. These targets may still touch on human rights; the analysis " +
    "did not find a clear match to one of the nine themes.",
};

type Rec = Record<string, unknown>;

/**
 * Move targets with no relevant category into the derived bucket.
 *
 * Returns the rewritten classification list plus the set of taxonomies that
 * actually needed a bucket, so callers only append the bucket category where it
 * has content (matching how every lens is data-gated).
 */
export function applyUnclassifiedBuckets(
  classifications: Rec[],
  taxonomies: readonly string[] = UNCLASSIFIED_TAXONOMIES,
): { classifications: Rec[]; bucketed: Set<string> } {
  const bucketed = new Set<string>();
  if (!classifications.length || !taxonomies.length) {
    return { classifications, bucketed };
  }

  const taxSet = new Set(taxonomies);
  // targetId -> taxonomyType -> records, for the taxonomies in scope only.
  const byTargetTax = new Map<string, Map<string, Rec[]>>();
  for (const c of classifications) {
    const tax = String(c.taxonomyType ?? "");
    if (!taxSet.has(tax)) continue;
    const targetId = String(c.targetId ?? "");
    let perTax = byTargetTax.get(targetId);
    if (!perTax) {
      perTax = new Map();
      byTargetTax.set(targetId, perTax);
    }
    const list = perTax.get(tax);
    if (list) list.push(c);
    else perTax.set(tax, [c]);
  }

  // Weak primaries to demote, and the bucket records to add.
  const demote = new Set<Rec>();
  const added: Rec[] = [];
  for (const [targetId, perTax] of byTargetTax) {
    for (const [tax, records] of perTax) {
      if (records.some((r) => r.isRelevant === true)) continue;
      for (const r of records) {
        if (r.isPrimary === true) demote.add(r);
      }
      bucketed.add(tax);
      added.push({
        targetId,
        categoryId: unclassifiedIdFor(tax),
        taxonomyType: tax,
        isRelevant: true,
        isPrimary: true,
        score: 0,
        derived: true,
      });
    }
  }

  if (!added.length) return { classifications, bucketed };

  const rewritten = classifications.map((c) =>
    demote.has(c) ? { ...c, isPrimary: false } : c,
  );
  return { classifications: [...rewritten, ...added], bucketed };
}

/** The derived bucket category to append to a lens's category list. */
export function unclassifiedCategory(taxonomyType: string): Rec {
  return {
    id: unclassifiedIdFor(taxonomyType),
    name: UNCLASSIFIED_NAMES[taxonomyType] ?? "No clear theme",
    description: UNCLASSIFIED_DESCRIPTIONS[taxonomyType] ?? "",
    derived: true,
  };
}
