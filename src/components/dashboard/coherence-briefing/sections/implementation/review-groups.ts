/**
 * What needs a look on the Implementation slide, ranked per report.
 *
 * Two kinds of item, decided with the product owner (2026-09-09):
 *   - climate report (BTR): reported actions that may pull against policy
 *     targets, in the pipeline's ranking (most flagged pairs first), with
 *     their commitments and the AI rationale behind each flag;
 *   - biodiversity report (NR7): the cross-checks between the country's own
 *     rating, questionnaire answers and indicators (nr7-report/).
 * Gaps (targets with no reported action) and actions still on paper are the
 * full picture, not review items.
 *
 * Flagged pairs whose ACTION is an NR7 narrative (the NR7 alignment run) are
 * not review items: that run is uncalibrated and the NR7 group carries the
 * report's own evidence instead. They stay in the coverage dot-map. The
 * climate group therefore recomputes its counts on BTR actions only, so the
 * headline and the group caption equal the list by construction.
 *
 * Pure: no React, no i18n. The slide renders what this returns.
 */

import type { ActionPlanAlignmentSummary, StrainedAction } from "@/lib/implementation-coherence";
import type { Nr7ReportModel, Nr7Signal } from "../../nr7-report";

/** Rows shown before "Show all", per group (same cap as Where to Focus). */
export const REVIEW_CAP = 5;

export interface ClimateReviewGroup {
  /** BTR actions with >= 1 flagged pair, most flagged pairs first. */
  items: StrainedAction[];
  top: StrainedAction[];
  rest: StrainedAction[];
  total: number;
  hidden: number;
  /** BTR reported actions in the report (the caption's denominator). */
  totalActions: number;
  /** Distinct policy commitments the listed actions may pull against. */
  flaggedCommitments: number;
  /** Listed actions reported as ongoing or implemented. */
  underWay: number;
  /** Largest flagged-pair count in the group (magnitude bar scale). */
  maxCount: number;
}

export interface BiodiversityReviewGroup {
  /** Card-eligible signals first (existing order), then the rest. */
  items: Nr7Signal[];
  top: Nr7Signal[];
  rest: Nr7Signal[];
  total: number;
  hidden: number;
}

export type ReviewSentenceKey = "reviewBoth" | "reviewClimate" | "reviewBiodiversity" | "nothingFlagged";

export interface ReviewGroups {
  /** Null when the country has no BTR. */
  climate: ClimateReviewGroup | null;
  /** Null when the country has no NR7. */
  biodiversity: BiodiversityReviewGroup | null;
  sentenceKey: ReviewSentenceKey;
}

export function buildReviewGroups({
  summary,
  nr7Report,
  btrActions,
  cap = REVIEW_CAP,
}: {
  summary: ActionPlanAlignmentSummary | null;
  nr7Report: Nr7ReportModel | null;
  /** BTR reported actions in the report; 0 when the country has none. */
  btrActions: number;
  cap?: number;
}): ReviewGroups {
  const climate = summary && btrActions > 0 ? climateGroup(summary, btrActions, cap) : null;
  const biodiversity = nr7Report ? biodiversityGroup(nr7Report, cap) : null;
  const c = climate?.total ?? 0;
  const b = biodiversity?.total ?? 0;
  const sentenceKey: ReviewSentenceKey =
    c > 0 && b > 0 ? "reviewBoth" : c > 0 ? "reviewClimate" : b > 0 ? "reviewBiodiversity" : "nothingFlagged";
  return { climate, biodiversity, sentenceKey };
}

function climateGroup(summary: ActionPlanAlignmentSummary, btrActions: number, cap: number): ClimateReviewGroup {
  const items = summary.rankedActions.filter((a) => a.actionType !== "nr7");
  const commitments = new Set(items.flatMap((a) => a.commitments.map((c) => c.targetId)));
  return {
    items,
    top: items.slice(0, cap),
    rest: items.slice(cap),
    total: items.length,
    hidden: Math.max(0, items.length - cap),
    totalActions: btrActions,
    flaggedCommitments: commitments.size,
    underWay: items.filter((a) => a.underWay).length,
    maxCount: items.reduce((m, a) => Math.max(m, a.potentialMisalignmentCount), 0),
  };
}

function biodiversityGroup(model: Nr7ReportModel, cap: number): BiodiversityReviewGroup {
  // Signals held back from the face (e.g. the unreviewed funding series) are
  // never in the top slice, even when it has room: they show only after
  // "Show all", after the remaining eligible ones. No rule name is known here.
  const eligible = model.signals.filter((s) => s.cardEligible);
  const heldBack = model.signals.filter((s) => !s.cardEligible);
  const top = eligible.slice(0, cap);
  const rest = [...eligible.slice(cap), ...heldBack];
  return { items: [...top, ...rest], top, rest, total: model.signals.length, hidden: rest.length };
}
