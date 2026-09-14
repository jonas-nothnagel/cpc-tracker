/**
 * "No clear theme" marker for ranked taxonomy lenses.
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
 * entry has its weak primary demoted and receives a derived
 * `<taxonomy>_unclassified` primary record instead, so it never counts inside
 * a real theme. The marker is display-side only: it is NEVER written to
 * `categories.json` (a pipeline input read by `load_input_data`, so a synthetic
 * category there would be fed to the classifier as if it were source-traced)
 * and never sent to an LLM. Derived records carry `derived: true` so they are
 * distinguishable from pipeline output.
 *
 * The marker is NOT listed as a category. Until Aug 2026 the dashboard
 * appended a "No clear human rights theme" row to the lens, which a
 * stakeholder review read as though every target ought to carry a rights
 * theme. Lens surfaces now exclude the marked targets (via
 * `unclassifiedTargetIds`) and state the lens scope in their coverage
 * sentence ("N of the M targets connect to one of these themes"), which keeps
 * the magnitude honest without presenting an absence as a theme.
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

type Rec = Record<string, unknown>;

/**
 * Targets whose primary for `taxonomyType` is the derived marker, i.e. the
 * targets a lens must leave out of its grouped views. Empty for taxonomies
 * without a marker.
 */
export function unclassifiedTargetIds(
  classifications: ReadonlyArray<{
    targetId?: unknown;
    categoryId?: unknown;
    taxonomyType?: unknown;
    isPrimary?: unknown;
  }>,
  taxonomyType: string,
): Set<string> {
  const ids = new Set<string>();
  for (const c of classifications) {
    if (
      c.isPrimary === true &&
      c.taxonomyType === taxonomyType &&
      isUnclassifiedCategoryId(String(c.categoryId ?? ""))
    ) {
      ids.add(String(c.targetId ?? ""));
    }
  }
  return ids;
}

/**
 * Move targets with no relevant category onto the derived marker.
 *
 * Returns the rewritten classification list plus the set of taxonomies that
 * actually needed a marker.
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
