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
import type { Nr7ReportModel, Nr7Signal, Nr7TargetRowModel } from "../../nr7-report";
import type { Nr7AnswerMix, Nr7IndicatorView } from "../../nr7-report/nr7-self-report";

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
  /** Fewest listed actions whose flagged pairs cover half of the group's. */
  actionsToHalf: number;
  /** Document ids by flagged commitments the listed actions touch, most
   *  first (ties by id). The takeaway names the first one or two. */
  topDocs: string[];
}

/** What a cross-check row shows beside the rating: the evidence that
 *  disagrees with it, in a shape a small glyph and a short label can read. */
export type Nr7Evidence =
  | { kind: "answers"; notInPlace: number; answered: number; mix: Nr7AnswerMix }
  | {
      kind: "series";
      direction: "flat" | "down" | "up";
      points: { year: string; value: number }[];
      first: number | null;
      last: number | null;
      from: string;
      to: string;
      unit: string;
    }
  | { kind: "values"; count: number; from: string; to: string }
  | { kind: "reach"; count: number; max: number };

export interface Nr7ReviewItem {
  signal: Nr7Signal;
  /** The national target the signal is about; null for indicator signals. */
  row: Nr7TargetRowModel | null;
  indicator: Nr7IndicatorView | null;
  evidence: Nr7Evidence | null;
}

export interface BiodiversityReviewGroup {
  /** Card-eligible signals first (existing order), then the rest. */
  items: Nr7ReviewItem[];
  top: Nr7ReviewItem[];
  rest: Nr7ReviewItem[];
  total: number;
  hidden: number;
}

export interface ReviewGroups {
  /** Null when the country has no BTR. */
  climate: ClimateReviewGroup | null;
  /** Null when the country has no NR7. */
  biodiversity: BiodiversityReviewGroup | null;
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
  return { climate, biodiversity };
}

function climateGroup(summary: ActionPlanAlignmentSummary, btrActions: number, cap: number): ClimateReviewGroup {
  const items = summary.rankedActions.filter((a) => a.actionType !== "nr7");
  const commitments = new Set(items.flatMap((a) => a.commitments.map((c) => c.targetId)));
  const totalPairs = items.reduce((s, a) => s + a.potentialMisalignmentCount, 0);
  let cumulative = 0;
  let actionsToHalf = 0;
  for (const a of items) {
    if (totalPairs === 0 || cumulative >= totalPairs / 2) break;
    cumulative += a.potentialMisalignmentCount;
    actionsToHalf += 1;
  }
  const byDoc = new Map<string, number>();
  for (const a of items) for (const c of a.commitments) byDoc.set(c.doc, (byDoc.get(c.doc) ?? 0) + 1);
  const topDocs = [...byDoc.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([doc]) => doc);
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
    actionsToHalf,
    topDocs,
  };
}

function evidenceFor(signal: Nr7Signal, row: Nr7TargetRowModel | null, indicator: Nr7IndicatorView | null, maxReach: number): Nr7Evidence | null {
  switch (signal.rule) {
    case "ratingVsAnswers":
      return row ? { kind: "answers", notInPlace: row.notInPlace.length, answered: row.answers.answered, mix: row.answers } : null;
    case "unknownWithData":
      return { kind: "values", count: Number(signal.params.points ?? 0), from: String(signal.params.from ?? ""), to: String(signal.params.to ?? "") };
    case "reachWhileNoChange":
      return row && row.policyReach !== null ? { kind: "reach", count: row.policyReach, max: maxReach } : null;
    case "flatWhileOnTrack":
    case "sharedIndicatorDeclining": {
      if (!indicator) return null;
      const wanted = signal.rule === "flatWhileOnTrack" ? "flat" : "down";
      // The series the rule read: the first with that direction and enough
      // points (flat), or the total series (falling), mirroring detectSignals.
      const idx = signal.rule === "flatWhileOnTrack"
        ? indicator.reads.findIndex((r) => r.direction === "flat" && r.points >= 3)
        : Math.max(0, indicator.reads.findIndex((r) => r.disaggregation === null && r.points >= 3));
      const read = indicator.reads[idx];
      const series = indicator.series[idx];
      if (!read || !series || read.direction !== wanted) return null;
      return {
        kind: "series",
        direction: wanted,
        points: series.points.filter((p): p is typeof p & { value: number } => p.value !== null).map((p) => ({ year: String(p.year), value: p.value })),
        first: read.first,
        last: read.last,
        from: read.fromYear === null ? "" : String(read.fromYear),
        to: read.toYear === null ? "" : String(read.toYear),
        unit: read.unit ?? "",
      };
    }
  }
}

function biodiversityGroup(model: Nr7ReportModel, cap: number): BiodiversityReviewGroup {
  // Signals held back from the face (e.g. the unreviewed funding series) are
  // never in the top slice, even when it has room: they show only after
  // "Show all", after the remaining eligible ones. No rule name is known here.
  const maxReach = model.targets.reduce((m, r) => Math.max(m, r.policyReach ?? 0), 0);
  const toItem = (signal: Nr7Signal): Nr7ReviewItem => {
    const row = signal.targetId ? model.targets.find((r) => r.targetId === signal.targetId) ?? null : null;
    const indicator = signal.indicatorId ? model.indicators.find((i) => i.id === signal.indicatorId) ?? null : null;
    return { signal, row, indicator, evidence: evidenceFor(signal, row, indicator, maxReach) };
  };
  const eligible = model.signals.filter((s) => s.cardEligible).map(toItem);
  const heldBack = model.signals.filter((s) => !s.cardEligible).map(toItem);
  const top = eligible.slice(0, cap);
  const rest = [...eligible.slice(cap), ...heldBack];
  const items = [...top, ...rest];
  return { items, top, rest, total: model.signals.length, hidden: rest.length };
}
