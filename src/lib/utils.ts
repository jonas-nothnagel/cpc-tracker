import type {
  Target,
  ThematicClassification,
  PolicyDocumentType,
  AlignmentLevel,
  ContradictionType,
  CountryConfig,
  DocumentTypeEntry,
} from "@/types";

// ---------------------------------------------------------------------------
// Country-driven document type helpers
// ---------------------------------------------------------------------------
//
// These helpers drive every document-type label and color in the UI. The old
// hardcoded `DOC_LABELS` / `DOC_COLORS` / `DOC_MEDIUM_LABELS` / `DOC_FULL_LABELS`
// maps that used to live at the top of this file were deleted once every
// consumer migrated to these calls.
//
// Resolution order for every helper:
//   1. `countryConfig.documentTypes` — country-specific mapping loaded from
//      `{country}-country-config.json`. Country entries override the reserved
//      fallback when both are present (lets a country rename BTR if needed).
//   2. Reserved token (BTR, OTHER) — universal fallback so every country
//      renders these consistently without having to declare them.
//   3. Raw id or neutral fallback — for unknown ids, return the id itself for
//      labels and a neutral gray for colors.

/**
 * Universal fallback for the reserved document-type tokens. Every country
 * gets these without having to declare them in their config.
 * - `BTR`: Biennial Transparency Report — mitigation measures (CTF Table 5)
 * - `BTR_ADP`: Biennial Transparency Report — adaptation actions (Table III.9).
 *   Synthetic key used by visualisations that split BTR by `actionType` so that
 *   mitigation and adaptation render as distinct stacks. Targets keep
 *   `sourceDocument === "BTR"`; the split is computed by `chartDocKey` at
 *   chart-construction time.
 * - `OTHER`: catch-all when a target's `sourceDocument` is not declared
 */
const RESERVED_DOC_TYPES: Record<string, DocumentTypeEntry> = {
  BTR: {
    id: "BTR",
    shortLabel: "BTR Action",
    mediumLabel: "BTR (Transparency)",
    fullLabel: "Biennial Transparency Report",
    color: "#7c3aed",
  },
  BTR_ADP: {
    id: "BTR_ADP",
    shortLabel: "BTR Adaptation",
    mediumLabel: "BTR (Adaptation)",
    fullLabel: "Biennial Transparency Report — adaptation actions",
    color: "#c026d3",
  },
  OTHER: {
    id: "OTHER",
    shortLabel: "Other",
    mediumLabel: "Other",
    fullLabel: "Other Policy Document",
    color: "#78716c",
  },
};

/** Neutral gray used when no country config has a color for an unknown id. */
const NEUTRAL_DOC_COLOR = "#94a3b8";

/**
 * Resolve a document-type entry for `docId` against the active country config.
 * Country declarations win over the reserved fallback so a country can rename
 * `BTR` or `OTHER` if the display context demands it. Returns `undefined` if
 * the id is unknown in both sources — callers fall back to the raw id for
 * labels or to `NEUTRAL_DOC_COLOR` for colors.
 */
function resolveDocEntry(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
): DocumentTypeEntry | undefined {
  const fromConfig = countryConfig?.documentTypes?.find((d) => d.id === docId);
  if (fromConfig) return fromConfig;
  return RESERVED_DOC_TYPES[docId];
}

/**
 * Short label for a document type (chart axis, chip, table header).
 * Falls back to the raw id so unknown values are still visible.
 */
export function getDocLabel(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
): string {
  return resolveDocEntry(countryConfig, docId)?.shortLabel ?? docId;
}

/**
 * Medium-length label for a document type (chart legend, secondary headings).
 */
export function getDocMediumLabel(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
): string {
  return resolveDocEntry(countryConfig, docId)?.mediumLabel ?? docId;
}

/**
 * Full human-readable document name (tooltip titles, provenance text).
 */
export function getDocFullLabel(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
): string {
  return resolveDocEntry(countryConfig, docId)?.fullLabel ?? docId;
}

/**
 * Hex color for a document type. Neutral gray when unknown so charts still
 * render visibly rather than with no fill.
 */
export function getDocColor(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
): string {
  return resolveDocEntry(countryConfig, docId)?.color ?? NEUTRAL_DOC_COLOR;
}

/**
 * Sort-order index for `docId` within the active country's document-type list.
 * Used by `data-sources-overview.tsx` and other components that render document
 * types in a consistent order. Reserved tokens come after country-declared
 * entries so `BTR` and `OTHER` don't push country-specific docs down.
 * Unknown ids sort to the end so they never shuffle the rest of the chart.
 */
export function getDocTypeOrder(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
): number {
  const configIndex = countryConfig?.documentTypes?.findIndex((d) => d.id === docId) ?? -1;
  if (configIndex >= 0) return configIndex;
  // Reserved tokens appear after country-declared entries but before unknowns.
  // Offset by a large number so any sensible country list fits below.
  // BTR_ADP follows BTR so the two render adjacent in legends/tooltips.
  const reservedOffset = 1_000_000;
  if (docId === "BTR") return reservedOffset;
  if (docId === "BTR_ADP") return reservedOffset + 1;
  if (docId === "OTHER") return reservedOffset + 2;
  return Number.MAX_SAFE_INTEGER;
}

/**
 * Synthetic doc key used by visualisations that group BTR pseudo-targets by
 * `actionType`. Returns `"BTR_ADP"` for BTR adaptation actions and
 * `target.sourceDocument` otherwise.
 *
 * Mongolia's BTR mitigation actions self-report into IPCC sectors, but
 * adaptation actions are framed by APNDC goals — when both are forced into the
 * same IPCC chart under a single "BTR Action" stack, the chart contradicts the
 * "Reporting Gaps" callout (which counts mitigation only by the self-reported
 * sector field). Splitting at chart-construction time keeps the two visible as
 * distinct stacks without changing target shape, the BTR badge label on
 * individual rows, or any pipeline output.
 */
export function chartDocKey(target: Target): string {
  if (target.sourceDocument === "BTR" && target.actionType === "adaptation") {
    return "BTR_ADP";
  }
  return target.sourceDocument;
}

/** Bidirectional color scale: red for contradictions, green for alignment */
export const ALIGNMENT_COLORS: Record<AlignmentLevel, string> = {
  high_contradiction: "#b91c1c",
  moderate_contradiction: "#dc2626",
  low_tension: "#f87171",
  none: "#f7f7f7",
  low: "#c6e48b",
  medium: "#7bc96f",
  high: "#196127",
};

/** Human-readable labels for each relationship level */
export const ALIGNMENT_LABELS: Record<AlignmentLevel, string> = {
  high_contradiction: "High contradiction",
  moderate_contradiction: "Moderate contradiction",
  low_tension: "Low tension",
  none: "No relationship",
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Human-readable labels for contradiction types */
export const CONTRADICTION_TYPE_LABELS: Record<ContradictionType, string> = {
  goal_conflict: "Goal conflict",
  resource_competition: "Resource competition",
  implementation_tension: "Implementation tension",
  scale_scope_mismatch: "Scale/scope mismatch",
};

/** Ordered list of all levels from most negative to most positive */
export const ALIGNMENT_LEVEL_ORDER: AlignmentLevel[] = [
  "high_contradiction",
  "moderate_contradiction",
  "low_tension",
  "none",
  "low",
  "medium",
  "high",
];

/** Numeric weight for coherency score calculation (negative for contradictions) */
export const ALIGNMENT_WEIGHTS: Record<AlignmentLevel, number> = {
  high_contradiction: -3,
  moderate_contradiction: -2,
  low_tension: -1,
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Count how many targets are classified under each category, broken down by
 * source document type.
 *
 * Pass `resolveDocKey` to bucket some targets under a synthetic key — used by
 * the Thematic Classification chart to split BTR pseudo-targets into separate
 * "BTR" (mitigation) and "BTR_ADP" (adaptation) stacks. Defaults to
 * `target.sourceDocument`.
 */
export function countByCategory(
  targets: Target[],
  classifications: ThematicClassification[],
  categories: { id: string; name: string }[],
  resolveDocKey?: (target: Target) => string
): {
  categoryId: string;
  categoryName: string;
  total: number;
  byDocument: Record<PolicyDocumentType, number>;
}[] {
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const docKey = resolveDocKey ?? ((t: Target) => t.sourceDocument);

  return categories.map((cat) => {
    const relevant = classifications.filter(
      (c) => c.categoryId === cat.id && c.isRelevant
    );
    // Start empty; the loop below inserts each document type it encounters.
    // Under the open PolicyDocumentType contract, document type ids are
    // country-driven and the old closed union is no longer reliable.
    // Consumers that read `byDocument[doc]` for a doc that didn't appear in
    // the loop get `undefined` — use `?? 0` at consumer sites when doing
    // arithmetic, Recharts already tolerates undefined.
    const byDoc: Record<string, number> = {};
    for (const c of relevant) {
      const target = targetMap.get(c.targetId);
      if (target) {
        const key = docKey(target);
        byDoc[key] = (byDoc[key] ?? 0) + 1;
      }
    }
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      total: relevant.length,
      byDocument: byDoc,
    };
  });
}

