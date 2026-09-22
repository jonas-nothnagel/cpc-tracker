/**
 * Document classification and hierarchy (removable system).
 *
 * WHY THIS EXISTS: the Panama focus group (23 Jul 2026) found that presenting
 * documents of different types and hierarchies without differentiation leads
 * readers to misread the relationships between them. A national commitment
 * framework and a single watershed's territorial plan currently look like peers
 * on the wheel. This module gives every document two display-only attributes —
 * what KIND of instrument it is (`docClass`) and WHERE it sits in the national
 * hierarchy (`docTier`) — so every surface can order and group consistently.
 *
 * SELF-CONTAINED BY DESIGN. It reads `countryConfig.documentTypes` directly
 * rather than importing the private `resolveDocEntry` from `@/lib/utils`, so the
 * whole system is one deletable directory. See README.md for the removal recipe.
 *
 * PROVENANCE. `DOC_CLASSES` is a PROJECT-DEFINED vocabulary — a normalisation of
 * the free-text `docKind` strings countries already declare. The vocabulary is
 * ours; each document's ASSIGNMENT to a class and tier must trace to that
 * document's own self-description (see `_docClassComment` in each country
 * config). Never infer a tier from a document's subject matter.
 *
 * Every field is optional. A country that declares neither `docClass` nor
 * `docTier` gets `undefined` from every accessor here, and every call site
 * falls back to the behaviour it had before this module existed.
 */

import type { CountryConfig, DocumentTypeEntry } from "@/types";

/**
 * The controlled vocabulary of instrument kinds. Ordered loosely from
 * whole-of-government commitment down to operational instrument; the ordering
 * here is documentation only, real ordering comes from `docTier`.
 *
 * Display labels live in the message catalog under `docTaxonomy.class.<id>` so
 * all three locales stay in lockstep — never hardcode a label here.
 */
export const DOC_CLASSES = [
  /** A national commitment or pledge that other instruments answer to. */
  "commitment",
  /** A whole-of-government strategic plan for an administration's term. */
  "strategic_plan",
  /** A national plan scoped to one sector or theme. */
  "sector_plan",
  /** A national strategy scoped to one sector or theme. */
  "sector_strategy",
  /** A roadmap that operationalises a higher instrument. */
  "roadmap",
  /** A national programme with its own delivery targets. */
  "programme",
  /** A spatial or territorial planning instrument, often subnational. */
  "territorial_instrument",
  /** International reporting (BTR and equivalents). Not a policy instrument. */
  "reporting",
] as const;

export type DocClass = (typeof DOC_CLASSES)[number];

/** Lowest (most senior) and highest tier numbers the UI expects to see. */
export const MIN_DOC_TIER = 1;
export const MAX_DOC_TIER = 5;

export function isDocClass(value: string): value is DocClass {
  return (DOC_CLASSES as readonly string[]).includes(value);
}

/**
 * Taxonomy for the reserved document tokens every country inherits without
 * declaring them (mirrors `RESERVED_DOC_TYPES` in `@/lib/utils`). BTR is a
 * transparency report, not a policy instrument, so it sits at the bottom tier
 * and reads as "reporting" wherever documents are grouped. `OTHER` is
 * deliberately absent: an uncategorised catch-all has no honest tier.
 */
const RESERVED_DOC_TAXONOMY: Record<string, { docClass: DocClass; docTier: number }> = {
  BTR: { docClass: "reporting", docTier: 5 },
  BTR_ADP: { docClass: "reporting", docTier: 5 },
};

function resolveEntry(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
): Pick<DocumentTypeEntry, "docClass" | "docTier"> | undefined {
  const fromConfig = countryConfig?.documentTypes?.find((d) => d.id === docId);
  if (fromConfig?.docClass || fromConfig?.docTier !== undefined) return fromConfig;
  return RESERVED_DOC_TAXONOMY[docId];
}

/**
 * What kind of instrument `docId` is, or `undefined` when the country has not
 * classified it. Callers must render nothing rather than guessing a class.
 */
export function getDocClass(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
): DocClass | undefined {
  const value = resolveEntry(countryConfig, docId)?.docClass;
  return value && isDocClass(value) ? value : undefined;
}

/**
 * Where `docId` sits in the national hierarchy (1 = national commitment the
 * others answer to), or `undefined` when the country has not tiered it.
 */
export function getDocTier(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
): number | undefined {
  return resolveEntry(countryConfig, docId)?.docTier;
}

/**
 * Whether this country has enough taxonomy to justify tier-grouped UI. False
 * for a country that declared none, which is the signal every call site uses to
 * fall back to its pre-existing flat rendering.
 *
 * Reserved-token taxonomy alone does not count: a corpus whose only tiered
 * document is BTR has nothing to group.
 */
export function hasDocTaxonomy(
  countryConfig: CountryConfig | null | undefined,
): boolean {
  return Boolean(
    countryConfig?.documentTypes?.some((d) => d.docTier !== undefined),
  );
}

/**
 * Sort index for `docId` by tier, for surfaces that order documents. Documents
 * with no tier sort after every tiered one, preserving their relative config
 * order via `fallbackIndex` so an untiered country's lists do not reshuffle.
 *
 * `fallbackIndex` is expected to be the caller's existing order value (i.e.
 * `getDocTypeOrder`), which keeps this a pure refinement of current behaviour.
 */
export function docTierSortKey(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
  fallbackIndex: number,
): number {
  const tier = getDocTier(countryConfig, docId);
  if (tier === undefined) return Number.MAX_SAFE_INTEGER;
  // Tier dominates; the caller's existing order breaks ties within a tier so
  // documents of equal seniority keep the sequence the country declared.
  return tier * 1_000_000 + Math.min(fallbackIndex, 999_999);
}

export interface DocTierGroup {
  tier: number;
  docIds: string[];
}

/**
 * Group `docIds` into tiers, most senior first, for legends and filter lists.
 * Documents with no tier collect into a final group keyed `undefined`-adjacent
 * (`tier: MAX_DOC_TIER + 1`) so they are still shown, just last.
 *
 * Input order is preserved inside each group, so a caller that already sorted
 * by its own rules keeps that sequence within a tier.
 */
export function groupDocsByTier(
  countryConfig: CountryConfig | null | undefined,
  docIds: string[],
): DocTierGroup[] {
  const byTier = new Map<number, string[]>();
  const untieredKey = MAX_DOC_TIER + 1;
  for (const docId of docIds) {
    const tier = getDocTier(countryConfig, docId) ?? untieredKey;
    const bucket = byTier.get(tier);
    if (bucket) bucket.push(docId);
    else byTier.set(tier, [docId]);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, ids]) => ({ tier, docIds: ids }));
}
