import type {
  Target,
  ThematicClassification,
  PolicyDocumentType,
  AlignmentLevel,
  ContradictionType,
} from "@/types";

/** Color palette for policy document types — clean UNDP palette */
export const DOC_COLORS: Record<PolicyDocumentType, string> = {
  NDC: "#0468b1",     // UNDP primary blue
  NBSAP: "#0d9488",  // Teal
  NAP: "#b45309",    // Warm amber
  LDN: "#dc2626",    // Red
  SECTORAL: "#4f7942", // Forest green — sectoral/land policies
  BTR: "#7c3aed",    // Violet — implementation / M&E data
  OTHER: "#78716c",  // Warm brown-grey — neutral but not cold
};

/** Shorter labels for chart axes */
export const DOC_LABELS: Record<PolicyDocumentType, string> = {
  NDC: "NDC",
  NBSAP: "NBSAP",
  NAP: "NAP",
  LDN: "LDN",
  SECTORAL: "Sectoral",
  BTR: "BTR Measure",
  OTHER: "Other",
};

/** Medium-length labels for contexts with moderate space */
export const DOC_MEDIUM_LABELS: Record<PolicyDocumentType, string> = {
  NDC: "NDC (Climate)",
  NBSAP: "NBSAP (Biodiversity)",
  NAP: "NAP (Adaptation)",
  LDN: "LDN (Land)",
  SECTORAL: "Sectoral Policy",
  BTR: "BTR (Transparency)",
  OTHER: "Other",
};

/** Full human-readable document names */
export const DOC_FULL_LABELS: Record<PolicyDocumentType, string> = {
  NDC: "Nationally Determined Contribution",
  NBSAP: "National Biodiversity Strategy & Action Plan",
  NAP: "National Adaptation Plan",
  LDN: "Land Degradation Neutrality",
  SECTORAL: "Sectoral Policy",
  BTR: "Biennial Transparency Report",
  OTHER: "Other Policy Document",
};

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
 * Count how many targets are classified under each category,
 * broken down by source document type.
 */
export function countByCategory(
  targets: Target[],
  classifications: ThematicClassification[],
  categories: { id: string; name: string }[]
): {
  categoryId: string;
  categoryName: string;
  total: number;
  byDocument: Record<PolicyDocumentType, number>;
}[] {
  const targetMap = new Map(targets.map((t) => [t.id, t]));

  return categories.map((cat) => {
    const relevant = classifications.filter(
      (c) => c.categoryId === cat.id && c.isRelevant
    );
    const byDoc: Record<PolicyDocumentType, number> = {
      NDC: 0,
      NBSAP: 0,
      NAP: 0,
      LDN: 0,
      SECTORAL: 0,
      BTR: 0,
      OTHER: 0,
    };
    for (const c of relevant) {
      const target = targetMap.get(c.targetId);
      if (target) byDoc[target.sourceDocument]++;
    }
    return {
      categoryId: cat.id,
      categoryName: cat.name,
      total: relevant.length,
      byDocument: byDoc,
    };
  });
}

