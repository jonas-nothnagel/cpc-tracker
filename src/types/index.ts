/**
 * Core data types for the CPC Analyzer.
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

/**
 * Describes how the display `text` field relates to the underlying source spans.
 *
 * - `verbatim`   : `text` equals one `sources[].sourceText` after whitespace normalisation.
 * - `cleaned`    : `text` is a deterministic light cleanup of one source (drop numeric prefix
 *                  like "Target 1.", join broken lines, normalise whitespace). No words added,
 *                  no semantic changes.
 * - `synthesis`  : `text` is composed from multiple `sources[]` entries. Every concrete claim
 *                  in `text` (numbers, deadlines, named frameworks, specific verbs) MUST be
 *                  grounded in at least one source span. The post-extraction validator enforces
 *                  this. Surfaces in the UI as an "AI-summarised" badge.
 */
export type TextCleanup = "verbatim" | "cleaned" | "synthesis";

/**
 * A verbatim source span backing a display `text` field. Every Target / Activity / Measure
 * carries an array of these so the dashboard can always show the original wording on demand
 * and stakeholders can audit what the LLM produced.
 */
export interface TargetSource {
  /** Verbatim quote from the source document. */
  sourceText: string;
  /** Page numbers in the source document where this quote appears. May be multiple if the
   *  same target is mentioned on several pages and was consolidated. */
  pages?: number[];
  /** Section or numeric identifier when the source has one (e.g. "6.2.12", "Goal 2", "1A3").
   *  Surfaced in tooltips / citations to make the audit trail concrete. */
  section?: string;
  /** Document name when distinct from the parent Target's `sourceDocument` — useful when
   *  consolidating across multiple files. */
  document?: string;
  /** Optional URL pointing at the canonical online source (e.g. CBD national targets portal). */
  url?: string;
  /** Result of the quote-in-document check run at extraction time: how strongly this
   *  claimed verbatim quote could be located in the parsed document text. "not_found"
   *  marks a quote the validator could not locate — surfaced as a review prompt. */
  _quoteMatch?: "exact" | "normalized" | "fuzzy" | "not_found";
}

/** A single policy target entered by a user. */
export interface Target {
  /** Unique identifier (e.g. "NDC_Biodiversity_1") */
  id: string;
  /**
   * Display text for this target. Used as the LLM input for classification and pairwise
   * alignment passes. Must be derivable from `sources[]` per `textCleanup` rules.
   */
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
  /** One entry per line of `activities`, present only where a curation step listed the
   *  activities as discrete items (Sri Lanka's NBSAP actions and NFAP clauses). Its
   *  presence is what tells the UI the newlines in `activities` separate items rather
   *  than wrapping one block of document text, as they do for Mongolia. */
  activitySources?: unknown[];
  /** Actions or measures to implement the target (from structured upload or manual entry) */
  actions?: string;
  /** For translated targets: the original-language text (e.g. Spanish source for Panama).
   *  Undefined when the target was provided in English. Populated in PR2. */
  textOriginal?: string;
  /** For translated targets: the original-language sourceLabel. Undefined when the
   *  target was provided in English. Populated in PR2. */
  sourceLabelOriginal?: string;
  /** ISO-639-1 language code of `textOriginal` (e.g. "es", "mn"). Optional —
   *  when missing, the renderer detects from `textOriginal` script. */
  language?: string;
  /** Provenance of `textOriginal`: "source" = genuine original-language wording
   *  ingested from the source document; "machine" = machine back-translation of
   *  the English `text` (no original was available). Drives the machine-
   *  translation caveat on the language chip. Undefined behaves as "source". */
  textOriginalSource?: "source" | "machine";
  /**
   * For BTR-sourced pseudo-targets: whether this came from a mitigation measure or
   * an adaptation action. Undefined for policy targets (NDC/NBSAP/NAP/...).
   */
  actionType?: BTRActionType;
  /**
   * Verbatim source span(s) this target was extracted from. At least one entry expected for
   * targets that went through the extraction pipeline; legacy entries pre-dating the schema
   * may have this empty (treated as unverified provenance — surfaced as a warning in dev).
   */
  sources?: TargetSource[];
  /** How `text` relates to `sources[]`. Defaults to `"verbatim"` if a single source whose
   *  `sourceText` matches `text`; otherwise must be set explicitly. */
  textCleanup?: TextCleanup;
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
  /** Primary source citation for the description (e.g. IPCC 2006 Guidelines volume/chapter/section). */
  source?: string;
}

// ---------------------------------------------------------------------------
// GLOBE Biodiversity Categories (BIOFIN)
// ---------------------------------------------------------------------------

/** A GLOBE taxonomy category used for cross-level biodiversity classification. */
export interface GlobeCategory {
  id: string;
  name: string;
  description: string;
  /** Primary source citation for the description. */
  source?: string;
}

/**
 * A Global Goal on Adaptation (GGA) thematic target — one of the seven
 * climate-resilience themes of the UAE Framework for Global Climate Resilience
 * (decision 2/CMA.5). Used as a selectable taxonomy lens.
 */
export interface GgaCategory {
  id: string;
  name: string;
  description: string;
  /** Primary source citation for the description. */
  source?: string;
}

/**
 * A human rights theme — one of the nine themes in the UNDP guidance
 * "Human rights themes for AI Flagship Policy Coherence Tracker", which builds
 * on UN Environment Management Group guidance on integrating human rights in
 * national biodiversity planning. Used as a selectable taxonomy lens.
 *
 * NOTE this taxonomy is a DRAFT under review by UNDP human rights experts.
 */
export interface HrCategory {
  id: string;
  name: string;
  description: string;
  /**
   * Display-only grouping from the source document, which separates
   * rights/issues themes from themes it groups by rights-holder ("Groups").
   * Never sent to the classifier.
   */
  block?: "rights" | "groups";
  /** Primary source citation for the description. */
  source?: string;
}

/**
 * A GLOBE subcategory (level 2) within a Primary Biodiversity Category.
 * These come directly from the BIOFIN GLOBE 2024 taxonomy and are used for
 * fine-grained BER classification.
 */
export interface GlobeSubcategory {
  /** Subcategory id (e.g. "6.01", "7.04") */
  id: string;
  /** Parent GLOBE category id (e.g. "globe_6") */
  parentId: string;
  /** Short name (e.g. "Soil and water") */
  name: string;
  /** Full description of what falls under this subcategory */
  description: string;
  /** Primary source citation for the description. */
  source?: string;
}

// ---------------------------------------------------------------------------
// Classification Results
// ---------------------------------------------------------------------------

/**
 * Probability-ranked classification: how strongly does a target pertain to
 * a given category? Each (target, taxonomy) pair has exactly one record
 * with `isPrimary: true` (the highest-scoring category, used by single-label
 * views) and any number of records with `isRelevant: true` (score above the
 * relevance threshold, used by multi-label views).
 */
export interface ThematicClassification {
  targetId: string;
  /** NBS category id, IPCC sector id, GLOBE category id, GLOBE subcategory id, or country-specific adaptation goal id */
  categoryId: string;
  /**
   * Which taxonomy this classification belongs to:
   * - "nbs": Nature-Based Solutions categories
   * - "sector": IPCC sectors
   * - "globe": GLOBE biodiversity expenditure categories (BIOFIN, 9 top-level)
   * - "globe_sub": GLOBE subcategories (BIOFIN, 48 fine-grained)
   * - "adaptation_goal": country-specific adaptation action plan goals
   *   (e.g. Mongolia APNDC's 8 goals from BTR1 Table III.9)
   * - "gga": Global Goal on Adaptation thematic targets (UAE Framework for
   *   Global Climate Resilience, decision 2/CMA.5; 7 climate-resilience themes)
   * - "hr": human rights themes (UNDP guidance building on UN Environment
   *   Management Group guidance; 9 themes — DRAFT under expert review)
   */
  taxonomyType:
    | "nbs"
    | "sector"
    | "globe"
    | "globe_sub"
    | "adaptation_goal"
    | "gga"
    | "hr";
  /** Whether the target pertains to this category (score >= relevance threshold) */
  isRelevant: boolean;
  /** True for the single highest-scoring category per (target, taxonomyType). Use this for single-label views. */
  isPrimary?: boolean;
  /** Probability-style score 0.0-1.0 assigned by the ranked classifier. */
  score?: number;
  /** Short reasoning (present for primary and relevant entries from ranked classifiers) */
  reasoning?: string;
  /** Legacy expert confidence level, still emitted by the GLOBE subcategory classifier when available */
  confidence?: "High" | "Medium" | "Low";
}

// ---------------------------------------------------------------------------
// Pairwise Alignment
// ---------------------------------------------------------------------------

/**
 * Pairwise relationship scale (v2.1).
 *
 * Positive side: "none" / "low" / "medium" / "high" (unchanged from v1).
 * Negative side: single canonical state "flagged" — the pipeline flags pairs
 * for human review and does not assert certain contradictions. Within the
 * flagged state, three sub-fields characterise the friction:
 *   - mechanism      (goal_conflict / resource_competition / delivery_friction)
 *   - manageability  (manageable / fundamental)
 *   - confidence     (low / medium / high)
 *
 * Legacy v1 keys (`likely_conflict`, `possible_conflict`, `possible_misalignment`,
 * `low_tension`, `moderate_contradiction`, `high_contradiction`) are migrated
 * at load time via `migrateLegacyAlignmentRecord` in `src/lib/alignment-migration.ts`.
 */
export type AlignmentLevel = "none" | "low" | "medium" | "high" | "flagged";

/** Kind of friction within a flagged pair. */
export type AlignmentMechanism =
  | "goal_conflict"
  | "resource_competition"
  | "delivery_friction";

/** Whether the friction needs coordination or target redesign. */
export type AlignmentManageability = "manageable" | "fundamental";

/** Strength of the text-level signal supporting the flag. */
export type AlignmentConfidence = "low" | "medium" | "high";

/**
 * Legacy alias kept for one PR to avoid a rename storm. New code should use
 * `AlignmentMechanism`. Note the value set differs: v1 had four types
 * (`implementation_tension`, `scale_scope_mismatch`) which collapse into
 * `delivery_friction` via the migration helper.
 */
export type ContradictionType = AlignmentMechanism;

/** Result of comparing two targets for alignment (v2.1 schema). */
export interface AlignmentResult {
  /** First target id */
  targetAId: string;
  /** Second target id */
  targetBId: string;
  /** Assessed relationship level. "flagged" = a real-world friction surfaced for review (shown as "Potential misalignment"). */
  alignment: AlignmentLevel;
  /** Kind of friction. Present only when alignment === "flagged". */
  mechanism?: AlignmentMechanism;
  /** Can coordination resolve it, or does a target need redesign? Present only when alignment === "flagged". */
  manageability?: AlignmentManageability;
  /** How strongly the text supports the flag. Present only when alignment === "flagged". */
  confidence?: AlignmentConfidence;
  /** AI-generated rationale for the classification */
  description: string;
  /**
   * Concrete dimension the flag concerns, extracted from `description` by the
   * friction-dimensions step (python/src/extract_friction_dimensions.py).
   * Surfaced as a per-pair chip. Both optional; every value is grounded in the
   * rationale text. `contestedResources` is the resource(s) two targets compete
   * for (shown for resource_competition); `sharedContext` is the shared place
   * they operate in (shown for delivery_friction).
   */
  contestedResources?: string[];
  sharedContext?: string;
}

/** Whether an alignment level represents a flagged pair (negative side of the scale). */
export function isContradiction(level: AlignmentLevel): boolean {
  return level === "flagged";
}

// ---------------------------------------------------------------------------
// Cross-model comparison report
// ---------------------------------------------------------------------------
//
// Mirrors python/output/{country}/_model_comparison.json produced by
// python/src/analyze_model_comparison.py. Shape is keyed by model slug
// everywhere so the page can iterate without coupling to a specific lineup.

export interface PairFlagDetails {
  /** goal_conflict | resource_competition | delivery_friction | unspecified (or any future enum value). */
  mechanism: string;
  /** "manageable" / "needs intervention" / "unknown" — assessor's view of whether the misalignment is addressable. */
  manageability: string;
  /** "low" / "medium" / "high" / "unknown" — model's self-reported confidence. */
  confidence: string;
  /** Resources both targets contest (e.g., "landscape", "budget"). May be empty. */
  contestedResources: string[];
}

export interface ModelDisagreementRow {
  targetAId: string;
  targetBId: string;
  /** Each model's alignment label for this pair. */
  labels: Record<string, AlignmentLevel>;
  /** Each model's AI-generated rationale (verbatim). */
  descriptions: Record<string, string>;
  /** Per-model flagged-pair metadata (mechanism, confidence, manageability,
   *  contestedResources). Only present for models whose alignment label is
   *  "flagged" on this pair — non-flagged models are absent from the map. */
  flagDetails: Record<string, PairFlagDetails>;
  /** Number of distinct labels across all models on this pair (≥2 for a row to appear). */
  distinctLabelCount: number;
  /** Ordinal spread used as the tiebreak sort key (see analyze_model_comparison.py). */
  ordinalSpread: number;
}

export interface TargetSummary {
  id: string;
  /** Target statement verbatim from the source policy document. */
  text: string;
  /** Source document slug (e.g., "NDC", "NBSAP", "FSS"). */
  sourceDocument: string;
  /** Reviewer-facing source label (e.g., "1 Spatial planning"). */
  sourceLabel: string;
  /** Implementation activities listed under the target, when present.
   *  Often the most concrete signal for evaluating cross-target tension. */
  activities?: string;
}

export interface ModelCostSummary {
  elapsedSeconds: number | null;
  callCount: number | null;
  trackedCallCount: number | null;
  estimatedCallCount: number | null;
  cachedCallCount: number | null;
  energyWh: number | null;
  waterMl: number | null;
  co2Geq: number | null;
  footprintSource: "measured" | "estimated" | "mixed" | "unavailable" | null;
}

export interface ModelVocabCompliance {
  /** Raw word occurrence counts across all rationales for this model. */
  tensionWordHits: number;
  contradictionWordHits: number;
  /** Count of rationales containing ≥1 banned word. */
  pairsWithViolation: number;
  /** pairsWithViolation / total pairs. */
  violationRate: number;
}

export interface ModelFlaggingOverlap {
  /** Pair counts keyed by "1" | "2" | "3" | "4" — pairs flagged by exactly N models. */
  flaggedByCount: Record<string, number>;
  /** Pairs flagged by all N models (the high-confidence concerns). */
  consensusFlaggedCount: number;
  /** Pairs flagged by at least one model (the union). */
  unionFlaggedCount: number;
}

export interface ModelRationaleCharacter {
  /** Mean whitespace-token count across all rationales. */
  avgWords: number;
  /** Median whitespace-token count. */
  medianWords: number;
  /** Fraction of rationales containing any digit. */
  pctNumeric: number;
  /** Fraction of rationales citing an observed target-ID prefix (NDC, FSS, ILDN, BTR …). */
  pctPolicyCitation: number;
}

export interface JudgeScore {
  specificity: number;
  reasoning: number;
  useful: number;
}

export interface JudgeAggregate {
  avgSpecificity: number;
  avgReasoning: number;
  avgUseful: number;
  /** Number of pairs in the sample where this model's rationale was picked as the winner. */
  winCount: number;
  /** Number of pairs where the judge produced a usable score for this model. */
  sampleSize: number;
}

export interface JudgeVerdict {
  targetAId: string;
  targetBId: string;
  /** Verbatim rationale per model slug — used to render side-by-side cards. */
  rationales: Record<string, string>;
  /** Slug → "A" | "B" | "C" | "D" — how this pair was anonymized to the judge. */
  shuffleMap: Record<string, string>;
  /** Judge's score per model slug. Slugs missing here means the judge skipped scoring them. */
  scores: Record<string, JudgeScore>;
  /** Winning slug per the judge (null if unparseable). */
  winnerSlug: string | null;
  /** Judge's 1–2 sentence rationale for picking the winner. */
  winnerReasoning: string;
}

export interface ModelComparisonReport {
  country: string;
  /** Target ID → statement + source-doc metadata. Populated for every target
   *  ID that appears in any row set; the UI uses this to render the actual
   *  policy statements alongside model rationales. */
  targets: Record<string, TargetSummary>;
  /** Model slugs, flagship-first (matches listAvailableModels ordering). */
  models: string[];
  /** Slug listed first — used for ordering and as the cost-pricing reference, NOT as ground truth. */
  flagship: string;
  /** Order of labels used for matrix rows/cols. */
  alignmentLevels: AlignmentLevel[];
  /** Pairs evaluated by every model (set intersection across all alignment.json). */
  pairCount: number;
  /** Sample of pair-keys present in one model but not all (for diagnostics). */
  missingPairs: Record<string, [string, string][]>;
  /** Per-model count of each alignment label across the common pairs. */
  distributions: Record<string, Record<AlignmentLevel, number>>;
  /** modelA → modelB → fraction of common pairs they agree on (descriptive only). */
  agreementMatrix: Record<string, Record<string, number>>;
  /** modelA → modelB → Cohen's κ (descriptive only). */
  kappaMatrix: Record<string, Record<string, number>>;
  /** How many pairs were flagged by exactly N of the M models. */
  flaggingOverlap: ModelFlaggingOverlap;
  /** Per model: top-N pairs only this model flagged — the model's distinctive signal. */
  uniqueSignal: Record<string, ModelDisagreementRow[]>;
  /** Per model: deterministic-random sample from the FULL solo-flag set (for evaluation). */
  uniqueSignalRandomSample: Record<string, ModelDisagreementRow[]>;
  /** Per model: total count of solo flags (so the UI can frame "30 of 6,882"). */
  uniqueSignalTotal: Record<string, number>;
  /** Deterministic-random sample of pairs flagged by every model (consensus). */
  consensusFlaggedRandomSample: ModelDisagreementRow[];
  /** Top-N most-contested pairs (capped at 50 in the analyzer). */
  disagreements: ModelDisagreementRow[];
  /** Per model: mechanism counts for flagged records. */
  mechanisms: Record<string, Record<string, number>>;
  /** Per model: cheap proxies for rationale specificity and citation behaviour. */
  rationaleCharacter: Record<string, ModelRationaleCharacter>;
  /** Per model: cost + footprint summary lifted from status.json. */
  costs: Record<string, ModelCostSummary>;
  /** Per model: banned-vocabulary audit (CLAUDE.md guardrail). */
  vocabCompliance: Record<string, ModelVocabCompliance>;
  /** Judge model used for the rationale-quality sample (null when the judge pass wasn't run). */
  judgeModel: string | null;
  /** Number of disagreement pairs sent to the judge (null when not run). */
  judgeSampleSize: number | null;
  /** Per-model aggregate scores from the judge pass (null when not run). */
  judgeAggregates: Record<string, JudgeAggregate> | null;
  /** Per-pair judge verdicts including unanonymized rationales (null when not run). */
  judgeVerdicts: JudgeVerdict[] | null;
}

// ---------------------------------------------------------------------------
// Manual evaluation ratings
// ---------------------------------------------------------------------------
//
// Human ratings on individual sampled pairs. Stored server-side in the
// append-only ledger `python/output/ratings-ledger.jsonl` (NOT localStorage —
// see memory/feedback_server_side_storage.md). Ratings persist across
// reviewers, browsers, and deploys; every POST to `/api/ratings/[country]`
// appends one event line.

/** The reviewer's own verdict for a pair, on the SAME scale the models use
 *  (`AlignmentLevel`) so human and model verdicts are directly comparable.
 *  Legacy ledger events carry the pre-July-2026 scheme ("real" | "thin" |
 *  "skip"): they stay in the ledger for audit and prompt calibration, but
 *  `loadRatings` ignores them and the evaluation page shows those pairs as
 *  unrated. */
export type PairRatingValue = AlignmentLevel;

export interface PairRating {
  rating: PairRatingValue;
  /** Optional free-text note the reviewer added alongside the rating. */
  note: string;
  /** Date.now() at the moment of the latest rating write. */
  ts: number;
}

/** Keyed by `${targetAId}::${targetBId}` (no canonical sorting — pair IDs come from the analyzer artifact and already match the source ordering). */
export type RatingsByCountry = Record<string, PairRating>;

/** One appended line in `python/output/ratings-ledger.jsonl`. The API route
 *  writes these; `loadRatings` folds them into a `RatingsByCountry` map by
 *  keeping the highest-`ts` event per `pairKey`. */
export interface PairRatingEvent extends PairRating {
  country: string;
  pairKey: string;
}

/** Per-model agreement between the model's stored verdicts and the
 *  reviewer's blind ratings. Computed server-side from alignment.json so
 *  per-pair verdicts never reach the blind page — only these aggregates. */
export interface ModelAgreementSummary {
  slug: string;
  /** Rated pairs this model has a verdict for. */
  n: number;
  /** Pairs where model and reviewer chose the exact same level. */
  exactMatches: number;
  /** Pairs where both sides agree on flagged vs not-flagged. */
  flagMatches: number;
}

/** A sampled pair with every model verdict stripped — all the blind
 *  evaluation page is allowed to see about a pair besides its targets. */
export type BlindPairSample = Pick<ModelDisagreementRow, "targetAId" | "targetBId">;

/** The slice of the model-comparison artifact the blind evaluation page
 *  receives. Built server-side by `sanitizeForBlindEvaluation` so model
 *  labels, rationales, and flag details never reach the client payload
 *  (not just the DOM) — a view-source can't unblind a reviewer. */
export interface BlindEvaluationReport {
  country: string;
  /** Model slugs, flagship-first — used only for ledger bookkeeping. */
  models: string[];
  /** Target ID → statement + source-doc metadata for the sampled pairs. */
  targets: Record<string, TargetSummary>;
  /** Per model: the same deterministic sample as the full report, verdicts stripped. */
  uniqueSignalRandomSample: Record<string, BlindPairSample[]>;
  /** The consensus sample from the full report, verdicts stripped. */
  consensusFlaggedRandomSample: BlindPairSample[];
}

// ---------------------------------------------------------------------------
// LLM Synthesis layer (post-processing of alignment.json + classifications.json)
// ---------------------------------------------------------------------------
//
// Shapes mirror the Python pipeline outputs in python/output/{country}/:
//   - doc_pair_synthesis.json  → DocPairSynthesis[]
//   - corpus_themes.json       → CorpusThemes
//   - sector_synthesis.json    → SectorSynthesis[]
//
// The `confidence` field is LLM-emitted; in current outputs it's always "high"
// so the UI does NOT render it as a chip. Pool sizes carry the signal instead.

/**
 * LLM-emitted counts of negative-side mechanism subtypes for a doc-pair or sector.
 *
 * v2.1 uses three mechanisms: goal_conflict / resource_competition / delivery_friction.
 * The two legacy v1 fields (implementation_tension, scale_scope_mismatch) are
 * accepted on read so that synthesis outputs produced before the v2 migration
 * still parse; the v2 pipeline now emits only the canonical keys above.
 */
export interface ContradictionTypeCounts {
  // v2.1 canonical
  goal_conflict?: number;
  resource_competition?: number;
  delivery_friction?: number;
  // v1 legacy (still accepted from old synthesis JSON; new outputs do not emit these)
  implementation_tension?: number;
  scale_scope_mismatch?: number;
}

/** The shared "reinforce + clash + coordination hint" synthesis block. */
export interface SynthesisBlock {
  storyline_name: string;
  reinforce: string;
  clash: string;
  coordination_hint: string;
  confidence: "high" | "medium" | "low";
}

/** One per cross-doc pair with ≥3 records (aligned + flagged). */
export interface DocPairSynthesis {
  doc_a: string;
  doc_b: string;
  label_a: string;
  label_b: string;
  aligned_count: number;
  flagged_count: number;
  contradiction_types: ContradictionTypeCounts;
  synthesis: SynthesisBlock;
  synthesis_error: string | null;
}

/** Bounded deterministic per-theme breakdowns (schema v2). Persisted for
 *  pipeline/chat/diagnostics; display surfaces live-recompute instead. */
export interface CorpusStorylineAggregates {
  /** Polarity-matched cross-doc pairs inside the theme's doc pairs. */
  pair_total: number;
  doc_shares: { doc: string; count: number; share: number }[];
  top_targets: { id: string; count: number }[];
  sector_tags: { taxonomy: string; category_id: string; count: number }[];
  /** Friction themes only. */
  contested_resources?: { resource: string; count: number }[];
  /** Friction themes only. */
  mechanisms?: Record<string, number>;
}

/** One theme ("storyline") in the corpus-level briefing. */
export interface CorpusStoryline {
  name: string;
  type: "reinforcement" | "friction";
  description: string;
  /** One hedged process-pointer sentence for the drill-down drawer (schema v2). */
  pathway?: string;
  /** Canonical "DocA<->DocB" strings; the corpus augmenter resolves human labels back to doc-ids. */
  contributing_doc_pairs: string[];
  confidence: "high" | "medium" | "low";
  unknown_doc_pairs?: string[];
  /**
   * Deterministic, from the pipeline run's document set. Friction (schema v2):
   * flagged pairs across the theme's disjoint doc pairs, exact and
   * non-overlapping. Reinforcement: aligned pairs across the cited doc pairs
   * (coverage; doc pairs may repeat across reinforcement themes). Display
   * surfaces never trust this for counts: they live-recompute from the
   * visible alignment so document toggling stays exact.
   */
  pair_count: number;
  /** Deterministic: sorted unique doc-ids the storyline spans. */
  spans_documents: string[];
  /** Target ids copied verbatim from the evidence tables (schema v2); the
   *  drawer pins them in its target list. */
  anchor_target_ids?: string[];
  aggregates?: CorpusStorylineAggregates;
}

/** Corpus-level briefing: a few high-level storylines + a 3-4 sentence summary. */
export interface CorpusThemes {
  storylines: CorpusStoryline[];
  summary_paragraph: string;
  doc_pair_count: number;
  /** 2 = theme synthesis rework (noun-phrase names, pathway, anchors, aggregates). */
  schema_version?: number;
  validation_warnings?: string[];
}

/** One synthesis per (taxonomy_type, category_id) with sufficient signal. */
export interface SectorSynthesis {
  taxonomy_type: string;
  category_id: string;
  category_name: string;
  aligned_count: number;
  flagged_count: number;
  /** Pool composition for UI transparency; "primary" = sector is primary on ≥1 side. */
  pool_composition: {
    primary_count: number;
    relevant_only_count: number;
  };
  contradiction_types: ContradictionTypeCounts;
  synthesis: SynthesisBlock;
  synthesis_error: string | null;
}

// ---------------------------------------------------------------------------
// BTR / CTF Data (parsed from Biennial Transparency Report Excel files)
// ---------------------------------------------------------------------------

/** A progress indicator from CTF Table 4. */
interface ProgressIndicator {
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
  /** Raw sector string from the source spreadsheet, before IPCC normalisation. */
  sectorRaw?: string;
  gasesAffected: string;
  startYear: string;
  implementingEntity: string;
  reductionEstimates: Record<string, number>;

  /** Original-language text preserved when `name` has been translated. */
  nameOriginal?: string;
  /** Original-language text preserved when `description` has been translated. */
  descriptionOriginal?: string;
  /** Original-language text preserved when `objectives` has been translated. */
  objectivesOriginal?: string;

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

  /**
   * Per-action verbatim source span (Table III.9 row text for adaptation; CTF Table 5
   * row text for mitigation). Reviewers should be able to compare `name`/`description`
   * against `source.sourceText` to verify the displayed wording is faithful.
   */
  source?: TargetSource;
}

/** @deprecated Use BTRAction. Kept as an alias so existing imports don't break. */
export type MitigationMeasure = BTRAction;

/** A single sector's emission time series from CTF Table 6. */
interface SectorEmissionSeries {
  category: string;
  normalizedSector: string;
  isTotal: boolean;
  yearlyEmissions: Record<string, number>;
  unit: string;
}

/** A projection row from CTF Table 7/9 (WEM/WAM/WOM). */
interface ProjectionSeries {
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
  // The fields below are optional, display-only reference metadata shown in the
  // doc-focus panel so users from other ministries can place a document they
  // don't know. Every value MUST trace to a primary/official source (never
  // LLM-drafted, per CLAUDE.md "No LLM-drafted content"); leave blank when not
  // reliably sourceable. They are read only by the dashboard, never fed into a
  // pipeline prompt.
  /** What kind of document it is, e.g. "National pledge", "REDD+ strategy". */
  docKind?: string;
  /** When it was developed/issued, e.g. "November 2025", "2025", "2025-2029". */
  published?: string;
  /** Issuing body / author, e.g. "Government of Panama", "SENACYT". */
  author?: string;
  /** Main goal, verbatim or closely quoted from the source. Optional. */
  objective?: string;
  /** Public link to the document. Must resolve and match the named document. */
  url?: string;
  /** Provenance note for the metadata above (esp. `objective`). */
  sourceNote?: string;
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
  /**
   * Document-type ids to exclude entirely from the dashboard. Unlike
   * `defaultHiddenDocTypes` (which only hides by default but lets users toggle),
   * excluded doc types are stripped at the API level: their targets, alignment
   * pairs, classifications, and config entries are never sent to the frontend.
   */
  excludedDocTypes?: string[];
  /**
   * Document-type ids hidden by default in the briefing's analytical views
   * (the coherence wheel on every slide, the doc-pairs matrix, section counts)
   * IN ADDITION to `defaultHiddenDocTypes`, so a country's strategic documents
   * lead every view while its second-tier documents stay one click away. Unlike
   * `defaultHiddenDocTypes` (hidden everywhere, including the Explore workbench),
   * these remain visible in Explore. Defaults to an empty list.
   */
  secondaryDocTypes?: string[];
  /**
   * Which mitigation grouping the Implementation Coverage view should default to.
   * - `"ipcc"` (default): group by IPCC sector (Mongolia and most countries).
   * - `"country_sectors"`: group by the country's own sector taxonomy from
   *   `countrySectors`. Useful when the IPCC mapping is too lossy (e.g. Panama).
   */
  mitigationTaxonomy?: "ipcc" | "country_sectors";
  /**
   * Country-specific mitigation sector taxonomy. Each entry's `id` must match
   * the `sectorRaw` value on BTRActions so measures group correctly. Only
   * required when `mitigationTaxonomy === "country_sectors"`.
   */
  countrySectors?: Array<{
    id: string;
    name: string;
    nameOriginal?: string;
    color?: string;
  }>;
  /**
   * `sourceDocument` id of the country's North-Star / long-term vision document.
   * When set, the dashboard renders the Vision Anchor Coverage view that centers
   * this document's targets and shows how every other policy document
   * operationalises (or diverges from) them. For Mongolia this is `"SECTORAL"`
   * (Vision 2050). Other countries opt in by pointing this at their own anchor
   * document id (e.g. a national development plan).
   */
  anchorDocType?: string;
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
// BER / Biodiversity Expenditure Review Data
// ---------------------------------------------------------------------------

/** A government budget program from the BER. */
export interface BerBudgetProgram {
  code: string;
  name: string;
  /** Optional English display name. When absent the UI falls back to `name`.
   *  Pipeline emits this for Panama (parse_panama_ber.py) — substantive
   *  programme names stay Spanish (MEF proper nouns); overhead rollups carry
   *  a curated English equivalent. */
  nameEn?: string;
  /** Optional owning institution (Spanish source-of-record). Emitted by
   *  parse_panama_ber.py for Panama; absent for Mongolia. */
  institution?: string;
  /** Optional curated English institution name. See `institution`. */
  institutionEn?: string;
  description: string;
  /** Optional Spanish UI description. Distinct from `description` (which is
   *  the LLM-input narrative kept cache-stable for budget_alignment). */
  descriptionEs?: string;
  /** Optional English UI description. See `descriptionEs`. */
  descriptionEn?: string;
  type: "environmental" | "non_environmental";
}

/** Yearly expenditure series for a budget program. */
export interface BerExpenditureSeries {
  code: string;
  name: string;
  /** Optional English display name (see BerBudgetProgram.nameEn). */
  nameEn?: string;
  /** Optional owning institution (Spanish source-of-record). See
   *  BerBudgetProgram.institution. */
  institution?: string;
  /** Optional curated English institution name. */
  institutionEn?: string;
  /** Values by year in the report's unit (e.g. billion MNT). null = no data. */
  values: Record<string, number | null>;
}

/** Structured BER data for a country. */
export interface BerData {
  programs: BerBudgetProgram[];
  expenditure: BerExpenditureSeries[];
  currency: string;
  unit: string;
  period: { start: number; end: number };
  keyFindings?: {
    /** Name of the program this planned-vs-actual headline refers to. Distinct
     *  from the year-by-year expenditure analysis (`period`). Optional: older
     *  BER data and other countries may not carry a named program. */
    programName?: string;
    /** Localised program names keyed by locale (e.g. "en", "mn", "es"). The UI
     *  prefers the active locale, falling back to `programName`. Prefer names
     *  taken from the country's own BER where they exist (the Mongolian name is
     *  verbatim from the BER); other locales may carry a translation. */
    programNameByLocale?: Record<string, string>;
    plannedBudget: number;
    actualExpenditure: number;
    gap: number;
    programPeriod: string;
  };
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


