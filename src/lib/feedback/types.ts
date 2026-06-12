/**
 * User feedback on AI-generated content (audit roadmap item 1, first slice).
 *
 * Feedback is an append-only event ledger layered over AI output; it never
 * modifies pipeline results. Votes are anonymous (a random per-browser
 * clientId exists only so a browser can update or retract its own vote).
 * Aggregates are analysis-only and never surface in the UI.
 *
 * Pure types; safe to import from client components.
 */

export const FEEDBACK_SCHEMA = 1;

/** Which AI-generated surface the feedback refers to. */
export type FeedbackSurface =
  | "target_pair_rationale"
  | "doc_pair_synthesis"
  | "corpus_storyline";

/**
 * "retracted" undoes this browser's previous vote on the same anchor; the
 * earlier event stays in the ledger (audit trail, never overwritten).
 */
export type FeedbackVote = "up" | "down" | "retracted";

/**
 * Snapshot of the AI verdict at vote time, so feedback stays interpretable
 * after a pipeline re-run changes the verdict. Analysis-only.
 */
export interface FeedbackContext {
  /** AlignmentLevel of the pair when voted (target-pair surface). */
  alignment?: string;
  /** AlignmentMechanism (may carry legacy v1 parser-alias values). */
  mechanism?: string;
  /** AlignmentConfidence. */
  confidence?: string;
  /** AlignmentManageability. */
  manageability?: string;
  /** Synthesis confidence (doc-pair surface). */
  synthesisConfidence?: string;
  /** "reinforcement" | "friction" (corpus-storyline surface). */
  storylineType?: string;
}

/** One ledger row. The server stamps `schema` and `ts` and derives `anchorKey`. */
export interface FeedbackEvent {
  schema: number;
  /** "YYYY-MM-DDTHH:MM:SSZ" (same format as the footprint ledger). */
  ts: string;
  /** Canonical country id; also selects the per-country ledger file. */
  country: string;
  surface: FeedbackSurface;
  /**
   * Stable identity of the rated item across pipeline re-runs: the sorted
   * `anchorIds` joined with "__". Sorted server-side so (a,b) and (b,a)
   * address the same feedback regardless of display order.
   */
  anchorKey: string;
  /**
   * 1-2 ids as displayed when voted: [targetAId, targetBId] for pair
   * rationales, [doc_a, doc_b] for doc-pair syntheses, or one slugified
   * storyline name for corpus storylines (LLM-named, so a renamed
   * storyline orphans old feedback by design; the ledger keeps it).
   */
  anchorIds: string[];
  vote: FeedbackVote;
  /** Optional user note (complaint capture); <= 2000 chars; null when absent. */
  comment: string | null;
  /** Random per-browser UUID; pseudonymous, used only for update/retract. */
  clientId: string;
  /** UI locale the rationale was read in ("en" | "es" | "mn"). */
  locale: string;
  /** sha256 hex of the full rationale/synthesis text the user saw. */
  contentHash: string;
  /** First 2000 chars of that text, so feedback is reviewable after re-runs. */
  contentSnapshot: string;
  context: FeedbackContext;
}

/** POST /api/feedback body: the event minus server-stamped/derived fields. */
export type FeedbackPostBody = Omit<
  FeedbackEvent,
  "schema" | "ts" | "anchorKey" | "comment" | "context"
> & {
  comment?: string;
  context?: FeedbackContext;
};

/** Max accepted user-note length (chars); mirrored by the textarea maxLength. */
export const FEEDBACK_COMMENT_MAX = 2000;

/** Stored snapshot cap (chars); longer snapshots are truncated, not rejected. */
export const FEEDBACK_SNAPSHOT_MAX = 2000;
