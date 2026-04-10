/**
 * Core data types for the CPC Tracker.
 *
 * These types model the entities described in the Mongolia Target
 * Alignment Assessment methodology, generalised for any country.
 */

// ---------------------------------------------------------------------------
// Policy Documents & Targets
// ---------------------------------------------------------------------------

/**
 * The type of policy document a target originates from. Open string so each
 * country can define its own set in `{country}-country-config.json` under
 * `documentTypes`. Only two tokens are reserved and have universal fallbacks
 * in `src/lib/utils.ts`:
 *   - `"BTR"`: Biennial Transparency Report (implementation / M&E data)
 *   - `"OTHER"`: catch-all for anything a country config does not declare
 * All other values (e.g. `"NDC"`, `"NP"`, `"ENR"`) must appear in the active
 * country's `documentTypes` array for labels, colors, and sort order to
 * resolve. Unknown ids fall back to the raw string. Country configs supply
 * the mapping via `CountryConfig.documentTypes` + the `getDocLabel` helpers.
 */
export type PolicyDocumentType = string;

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
  /** Implementation activities associated with this target (from structured upload or manual entry) */
  activities?: string;
  /** Actions or measures to implement the target (from structured upload or manual entry) */
  actions?: string;
  /** For translated targets: the original-language text (e.g. Spanish source for Panama).
   *  Undefined when the target was provided in English. Populated in PR2. */
  textOriginal?: string;
  /** For translated targets: the original-language sourceLabel. Undefined when the
   *  target was provided in English. Populated in PR2. */
  sourceLabelOriginal?: string;
  /**
   * For BTR-sourced pseudo-targets: whether this came from a mitigation measure or
   * an adaptation action. Undefined for policy targets (NDC/NBSAP/NAP/...).
   */
  actionType?: BTRActionType;
}

/** Kind of reported action from a Biennial Transparency Report. */
export type BTRActionType = "mitigation" | "adaptation";

/**
 * Provenance for a data point — cited to a primary document so users can audit it.
 * Any field added must be verifiable against the cited source; do not fabricate.
 */
export interface SourceRef {
  /** Canonical document name, e.g. "Mongolia BTR1 (December 2025)" */
  document: string;
  /** Section or chapter reference, e.g. "Section 3.9.1.8" */
  section?: string;
  /** Table reference, e.g. "Table III.9" or "CTF Table 5" */
  table?: string;
  /** Page range in the PDF, e.g. "123-126" */
  pages?: string;
  /** Annex reference, e.g. "Annex II" */
  annex?: string;
}

// ---------------------------------------------------------------------------
// Nature-Based Solution Categories
// ---------------------------------------------------------------------------

/** One of the 10 predefined NBS categories or added by users (IPCC / Griscom et al.) */
export interface NbsCategory {
  id: string;
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// IPCC Sectors
// ---------------------------------------------------------------------------

/** An IPCC sector used for sectoral classification (replaces cross-cutting themes). */
export interface IpccSector {
  id: string;
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// GLOBE Biodiversity Categories (BIOFIN)
// ---------------------------------------------------------------------------

/** A GLOBE taxonomy category used for cross-level biodiversity classification. */
export interface GlobeCategory {
  id: string;
  name: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Classification Results
// ---------------------------------------------------------------------------

/**
 * Binary classification: does a target pertain to a given NBS category,
 * IPCC sector, or GLOBE biodiversity category?
 */
export interface ThematicClassification {
  targetId: string;
  /** NBS category id, IPCC sector id, GLOBE category id, or country-specific adaptation goal id */
  categoryId: string;
  /**
   * Which taxonomy this classification belongs to:
   * - "nbs": Nature-Based Solutions categories
   * - "sector": IPCC sectors
   * - "globe": GLOBE biodiversity expenditure categories (BIOFIN)
   * - "adaptation_goal": country-specific adaptation action plan goals
   *   (e.g. Mongolia APNDC's 8 goals from BTR1 Table III.9)
   */
  taxonomyType: "nbs" | "sector" | "globe" | "adaptation_goal";
  /** Whether the target pertains to this category */
  isRelevant: boolean;
}

// ---------------------------------------------------------------------------
// Pairwise Alignment
// ---------------------------------------------------------------------------

/** Bidirectional relationship scale from contradiction to alignment. */
export type AlignmentLevel =
  | "high_contradiction"
  | "moderate_contradiction"
  | "low_tension"
  | "none"
  | "low"
  | "medium"
  | "high";

/** Types of policy contradiction, assigned when the relationship is negative. */
export type ContradictionType =
  | "goal_conflict"
  | "resource_competition"
  | "implementation_tension"
  | "scale_scope_mismatch";

/** Result of comparing two targets for alignment or contradiction. */
export interface AlignmentResult {
  /** First target id */
  targetAId: string;
  /** Second target id */
  targetBId: string;
  /** Assessed relationship level (negative = contradiction, positive = alignment) */
  alignment: AlignmentLevel;
  /** Type of contradiction, present only when relationship is negative */
  contradictionType?: ContradictionType;
  /** AI-generated rationale for the classification */
  description: string;
}

/** Whether an alignment level represents a contradiction. */
export function isContradiction(level: AlignmentLevel): boolean {
  return level === "high_contradiction" || level === "moderate_contradiction" || level === "low_tension";
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
// BTR / CTF Data (parsed from Biennial Transparency Report Excel files)
// ---------------------------------------------------------------------------

/** A progress indicator from CTF Table 4. */
export interface ProgressIndicator {
  name: string;
  unit: string;
  yearlyValues: Record<string, number>;
  targetLevel: number | null;
  targetYear: string | null;
  progressText: string;
  sourceSheet?: string;
}

/**
 * A reported policy action from a BTR — either a mitigation measure (CTF Table 5)
 * or an adaptation action (Table III.9 in Mongolia's BTR1).
 *
 * Adaptation-specific fields (`outcome`, `indicator`, `implementationStatus`,
 * `adaptationGoal`, `responsibleOrgs`) are optional and populated only for rows
 * where `actionType === "adaptation"`. Mitigation measures populate the CTF
 * Table 5 fields (`instrumentType`, `gasesAffected`, `reductionEstimates`, ...).
 */
export interface BTRAction {
  name: string;
  description: string;
  objectives: string;
  instrumentType: string;
  status: string;
  sector: string;
  gasesAffected: string;
  startYear: string;
  implementingEntity: string;
  reductionEstimates: Record<string, number>;

  /** Mitigation or adaptation. Defaults to "mitigation" when absent (legacy data). */
  actionType?: BTRActionType;

  // --- Adaptation-specific fields (from Table III.9) ---
  /** Intended outcome (Table III.9 "Outcome" column). */
  outcome?: string;
  /** Tracking indicator (Table III.9 "Indicator" column). */
  indicator?: string;
  /** Free-text implementation status narrative (Table III.9 rightmost column). */
  implementationStatus?: string;
  /** APNDC adaptation goal number (1-8). */
  adaptationGoal?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** List of responsible organizations (Table III.9 "Responsible organization" column). */
  responsibleOrgs?: string[];

  /** Provenance — cited to the primary document. */
  sourceRef?: SourceRef;
}

/** @deprecated Use BTRAction. Kept as an alias so existing imports don't break. */
export type MitigationMeasure = BTRAction;

/** A single sector's emission time series from CTF Table 6. */
export interface SectorEmissionSeries {
  category: string;
  normalizedSector: string;
  isTotal: boolean;
  yearlyEmissions: Record<string, number>;
  unit: string;
}

/** A projection row from CTF Table 7/9 (WEM/WAM/WOM). */
export interface ProjectionSeries {
  scenario: "wem" | "wam" | "wom";
  category: string;
  normalizedSector: string;
  isTotal: boolean;
  yearlyValues: Record<string, number>;
  unit: string;
}

/** A support project from CTF-FTC Tables 9/11. */
export interface SupportProject {
  title: string;
  description?: string;
  technologyType?: string;
  timeFrame?: string;
  recipientEntity?: string;
  implementingEntity?: string;
  supportType?: string;
  supportSource?: "technology" | "capacity_building" | "both";
  sector: string;
  sectorRaw?: string;
  subsector?: string;
  status?: string;
  impact?: string;
}

/** Combined BTR data from all CTF files for a country. */
export interface BtrData {
  sourceFile?: string;
  progressIndicators: ProgressIndicator[];
  /**
   * BTR reported actions — mitigation measures (from CTF Table 5) plus any
   * hand-curated adaptation actions (e.g. Mongolia Table III.9). Disambiguated
   * by `actionType` on each entry. Name kept for backward compatibility with
   * callers that assumed BTR only contained mitigation.
   */
  mitigationMeasures: BTRAction[];
  sectorEmissions: { bySector: SectorEmissionSeries[] };
  projections: ProjectionSeries[];
  technologySupport: SupportProject[];
  capacityBuilding: SupportProject[];
  /** Merged and deduplicated support projects from both tables. */
  supportProjects?: SupportProject[];
  /**
   * Country-specific adaptation goal taxonomy (e.g. Mongolia APNDC's 8 goals).
   * Populated from each country's hand-curated adaptation data file
   * (e.g. `mongolia-btr-adaptation.json`). The `id` field matches the
   * `adaptationGoal` number on each adaptation BTRAction and the `categoryId`
   * on adaptation_goal classifications. A second country just provides their
   * own file; no code changes needed.
   */
  adaptationGoals?: AdaptationGoal[];
  /**
   * Human-readable label for the adaptation grouping (e.g. "APNDC adaptation
   * goal"). Used in the adaptation section header. When absent, the view
   * falls back to a generic "Adaptation actions" header.
   */
  adaptationGroupingLabel?: string;
  /**
   * Structured provenance for the adaptation actions (document, section, table,
   * pages). Surfaced as a tooltip/citation on the adaptation source chip so a
   * second country's citation comes from their data file, not hardcoded copy.
   */
  adaptationSourceRef?: SourceRef;
}

/**
 * One entry in a country's document-type registry. Supplies the labels, color,
 * and ordering for a single `sourceDocument` id that appears in the country's
 * targets. Countries declare the full set in `documentTypes` on their config
 * file. Runtime lookups go through `getDocLabel` / `getDocColor` /
 * `getDocTypeOrder` in `src/lib/utils.ts` with a universal fallback for the
 * reserved `BTR` and `OTHER` tokens.
 */
export interface DocumentTypeEntry {
  /** The `sourceDocument` value used in this country's targets (e.g. "NDC"). */
  id: string;
  /** Short axis-label (e.g. "NDC"). */
  shortLabel: string;
  /** Medium label with category hint (e.g. "NDC (Climate)"). */
  mediumLabel: string;
  /** Full human-readable name (e.g. "Nationally Determined Contribution"). */
  fullLabel: string;
  /** Hex color for charts and chips. Must follow UNDP Data Viz guidelines. */
  color: string;
}

/**
 * Country-specific display configuration loaded from
 * `{country}-country-config.json`. Holds provenance strings and other
 * country-specific presentation details so a second country does not need
 * code changes in the frontend.
 */
export interface CountryConfig {
  /** Provenance citation per policy document type, shown as tooltip on source chips. */
  docProvenance?: Partial<Record<PolicyDocumentType, string>>;
  /** Structured source ref for BTR mitigation actions (CTF Table 5 for Mongolia). */
  btrMitigationSourceRef?: SourceRef;
  /**
   * Country's document-type registry. Defines the set of `sourceDocument`
   * values that appear in the country's targets, with labels and colors.
   * Consumed by `getDocLabel` / `getDocColor` / `getDocTypeOrder` helpers.
   * When null or undefined, helpers fall back to reserved tokens (BTR, OTHER)
   * or the raw id.
   */
  documentTypes?: DocumentTypeEntry[];
  /**
   * Document-type ids the dashboard should start with hidden in filter views
   * like the Policy Coherence Explorer. Used for documents that add visual
   * noise for a country without being hidden outright. Defaults to an empty
   * list (show everything). Users can still toggle these back on.
   */
  defaultHiddenDocTypes?: string[];
}

/**
 * One adaptation goal from a country-specific adaptation action plan.
 *
 * Carries only `id` and `description` (verbatim from the source document).
 * There is no `name` field because BTR Table III.9 doesn't carry short labels
 * for the goals and we don't have direct access to the underlying APNDC
 * document — synthesising a paraphrased short label would be fabrication.
 * The frontend truncates the description via CSS for row display and shows
 * the full text on hover and in click-to-expand panels.
 */
export interface AdaptationGoal {
  /** Stable identifier; string-keyed for symmetry with classification categoryId. */
  id: string;
  /**
   * Verbatim goal text from the country's adaptation action plan
   * (for Mongolia: BTR1 Table III.9, pp. 123-126).
   */
  description: string;
}

// ---------------------------------------------------------------------------
// NR7 Progress Data (CBD National Report 7)
// ---------------------------------------------------------------------------

export interface Nr7ProgressItem {
  targetId: string;
  targetText: string;
  progressStatus: "on_track" | "limited" | "no_progress" | "unknown";
  reportedActions: string[];
  progressSummary?: string | null;
  challenges?: string | null;
  examples?: string | null;
  /** Maps to an NBSAP target (e.g. "NBT_1") for direct lookup */
  nbsapTargetId?: string;
}

export interface Nr7Data {
  country: string;
  reportingPeriod: string;
  progressItems: Nr7ProgressItem[];
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
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  thematicClassifications: ThematicClassification[];
  alignmentResults: AlignmentResult[];
  decompositions?: TargetDecomposition[];
  btrData?: BtrData;
  nr7Data?: Nr7Data;
}

