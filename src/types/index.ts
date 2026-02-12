/**
 * Core data types for the CPC Tracker.
 *
 * These types model the entities described in the Mongolia Target
 * Alignment Assessment methodology, generalised for any country.
 */

// ---------------------------------------------------------------------------
// Policy Documents & Targets
// ---------------------------------------------------------------------------

/** The type of policy document a target originates from. */
export type PolicyDocumentType =
  | "NDC"
  | "NBSAP"
  | "NAP"
  | "LDN"
  | "SECTORAL"
  | "OTHER";

/** A single policy target entered by a user. */
export interface Target {
  /** Unique identifier (e.g. "NDC_Biodiversity_1") */
  id: string;
  /** Full target text as provided by the user */
  text: string;
  /** Source policy document type */
  sourceDocument: PolicyDocumentType;
  /** Human-readable label (e.g. "Biodiversity 1") */
  sourceLabel: string;
  /** Country ISO-3 or name */
  country: string;
  /** Whether the target includes numeric metrics */
  isQuantitative: boolean;
  /** Whether the target specifies a deadline */
  isTimeBound: boolean;
  /** Extracted quantitative phrase(s) for highlighting (e.g. "30%", "5.277 million tons") */
  quantitativeDetails?: string;
  /** Extracted time-bound phrase(s) for highlighting (e.g. "by 2030") */
  timeBoundDetails?: string;
}

// ---------------------------------------------------------------------------
// Nature-Based Solution Categories
// ---------------------------------------------------------------------------

/** One of the 10 predefined NBS categories (IPCC / Griscom et al.) */
export interface NbsCategory {
  id: string;
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Cross-Cutting Themes
// ---------------------------------------------------------------------------

/** A cross-cutting theme used for thematic classification. */
export interface Theme {
  id: string;
  name: string;
  description: string;
  /** Whether this theme was added by the user (vs predefined) */
  isCustom: boolean;
}

// ---------------------------------------------------------------------------
// Classification Results
// ---------------------------------------------------------------------------

/**
 * Binary classification: does a target pertain to a given NBS category
 * or cross-cutting theme?
 */
export interface ThematicClassification {
  targetId: string;
  /** Either an NBS category id or a theme id */
  categoryId: string;
  /** "nbs" or "theme" — which taxonomy this classification belongs to */
  taxonomyType: "nbs" | "theme";
  /** Whether the target pertains to this category */
  isRelevant: boolean;
}

// ---------------------------------------------------------------------------
// Pairwise Alignment
// ---------------------------------------------------------------------------

/** The four alignment levels from the methodology. */
export type AlignmentLevel = "none" | "low" | "medium" | "high";

/** Result of comparing two targets for alignment opportunity. */
export interface AlignmentResult {
  /** First target id */
  targetAId: string;
  /** Second target id */
  targetBId: string;
  /** Assessed alignment level */
  alignment: AlignmentLevel;
  /** AI-generated rationale for the classification */
  description: string;
}

// ---------------------------------------------------------------------------
// Structured Target Decomposition (Agent 1 output)
// ---------------------------------------------------------------------------

/** Structured breakdown of a target produced by Agent 1 (Target Analyst). */
export interface TargetDecomposition {
  targetId: string;
  goalPurpose: string;
  actionIntervention: string;
  ecosystemArea: string;
  targetAudience: string;
  expectedImpact: string;
}

// ---------------------------------------------------------------------------
// Full Analysis (assembled result for a country)
// ---------------------------------------------------------------------------

/** The complete analysis result for a set of targets. */
export interface AnalysisResult {
  country: string;
  createdAt: string;
  targets: Target[];
  nbsCategories: NbsCategory[];
  themes: Theme[];
  thematicClassifications: ThematicClassification[];
  alignmentResults: AlignmentResult[];
  decompositions?: TargetDecomposition[];
}

