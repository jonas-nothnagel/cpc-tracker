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
import type { Nr7PolicyLinks, Nr7ReportModel, Nr7Signal, Nr7TargetRowModel } from "../../nr7-report";
import type { Nr7AnswerMix, Nr7IndicatorView, Nr7Status } from "../../nr7-report/nr7-self-report";

/** Rows shown before "Show all", per group (same cap as Where to Focus). */
export const REVIEW_CAP = 5;

/** Policy-link rows shown before "Show all" on the biodiversity view. */
export const POLICY_LINK_CAP = 5;

/** A counterpart flagged against at least this many national targets is
 *  recurring: one review of it covers every one of those targets. */
export const RECURRING_MIN_TARGETS = 2;

/** Recurring counterparts shown before "Show all". */
export const RECURRING_CAP = 5;

/** "Behind schedule" in the report's own rating: progress at an insufficient
 *  rate, or no significant change. Unknown is not a rating of progress. */
export const POLICY_LINK_STATUSES: ReadonlySet<Nr7Status> = new Set<Nr7Status>(["limited", "no_progress"]);

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
  | { kind: "reach"; count: number; max: number }
  | { kind: "policyLinks"; count: number; max: number; docs: number; flagged: number; byDoc: { doc: string; high: number }[] };

/** One national target with its cross-document links (empty when the
 *  report's target restates no policy target in the corpus). */
export interface Nr7PolicyLinkItem {
  row: Nr7TargetRowModel;
  links: Nr7PolicyLinks;
  /** True when the report rates the target behind schedule. */
  behind: boolean;
  evidence: Extract<Nr7Evidence, { kind: "policyLinks" }>;
}

/** One national target a recurring counterpart is flagged against. */
export interface Nr7RecurringHit {
  targetId: string;
  /** "12" for NT12. */
  number: string;
  /** The target's text, for the fold to name it by. */
  text: string;
  status: Nr7Status;
  behind: boolean;
}

/** One policy target in another document flagged against several national
 *  targets' NBSAP counterparts: the same pair to review, repeated down the
 *  rows. Never the NBSAP side. */
export interface Nr7RecurringCounterpart {
  targetId: string;
  doc: string;
  label: string;
  text: string;
  /** National targets it is flagged against, behind schedule first, then by number. */
  hits: Nr7RecurringHit[];
  /** `hits.length`. */
  count: number;
  /** Hits rated behind schedule. */
  behindCount: number;
}

/** Where the flagged pairs across the rows concentrate. Null when no
 *  counterpart is flagged against RECURRING_MIN_TARGETS targets or more. */
export interface Nr7RecurringGroup {
  /** Counterparts flagged against >= RECURRING_MIN_TARGETS national targets,
   *  most first; ties by behind-schedule hits, document, label. */
  items: Nr7RecurringCounterpart[];
  top: Nr7RecurringCounterpart[];
  rest: Nr7RecurringCounterpart[];
  total: number;
  hidden: number;
  /** Flagged pairs over every row (each pair once). */
  totalPairs: number;
  /** Of those, the pairs the listed counterparts carry. */
  coveredPairs: number;
  /** Fewest listed counterparts whose pairs reach half of `totalPairs`. */
  toHalf: number;
  /** National targets in the report (the denominator of "N of T"). */
  targets: number;
}

export interface Nr7PolicyLinkGroup {
  /** Every national target in the report: the ones rated behind schedule
   *  first, then the rest; within each block most HIGH links first, ties by
   *  distinct documents, flagged links, target number. */
  items: Nr7PolicyLinkItem[];
  /** The counterparts the flagged pairs repeat on; null when none repeats. */
  recurring: Nr7RecurringGroup | null;
  /** The rows shown before "Show all" (`cap` rows). */
  top: Nr7PolicyLinkItem[];
  rest: Nr7PolicyLinkItem[];
  total: number;
  hidden: number;
  /** National targets rated behind schedule (the headline's "behind"). */
  candidates: number;
  /** Targets rated behind schedule with >= 1 HIGH link, ranked: the rows
   *  "Where to start" speaks about. Never empty. */
  lead: Nr7PolicyLinkItem[];
  /** The document most of the flagged pairs across every row are with
   *  (the body's one sentence about them); null when nothing is flagged. */
  topFlaggedDoc: { doc: string; flagged: number; total: number } | null;
  /** Largest HIGH-link count over every row. */
  maxCount: number;
}

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
  /** Targets rated behind schedule ranked by their links to other documents;
   *  null when none has a HIGH link (no policy alignment, or none visible). */
  policyLinks: Nr7PolicyLinkGroup | null;
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
  policyLinkCap = POLICY_LINK_CAP,
}: {
  summary: ActionPlanAlignmentSummary | null;
  nr7Report: Nr7ReportModel | null;
  /** BTR reported actions in the report; 0 when the country has none. */
  btrActions: number;
  cap?: number;
  policyLinkCap?: number;
}): ReviewGroups {
  const climate = summary && btrActions > 0 ? climateGroup(summary, btrActions, cap) : null;
  const biodiversity = nr7Report ? biodiversityGroup(nr7Report, cap, policyLinkCap) : null;
  return { climate, biodiversity };
}

const NO_LINKS: Nr7PolicyLinks = { high: [], flagged: [], byDoc: [], docs: 0 };

/** Every national target in the report, the ones rated behind schedule
 *  first, each block ranked by how many policy targets in other documents
 *  align HIGH with the NBSAP target it restates. Null when no target behind
 *  schedule has a HIGH link (the slide then falls back to the cross-checks).
 *  Deterministic. */
export function rankPolicyLinkCandidates(model: Nr7ReportModel, cap: number = POLICY_LINK_CAP): Nr7PolicyLinkGroup | null {
  const candidates = model.targets.filter((r) => POLICY_LINK_STATUSES.has(r.status));
  if (!candidates.some((r) => r.policyLinks && r.policyLinks.high.length > 0)) return null;
  const linksOf = (r: Nr7TargetRowModel) => r.policyLinks ?? NO_LINKS;
  const ranked = [...model.targets].sort(
    (a, b) =>
      Number(POLICY_LINK_STATUSES.has(b.status)) - Number(POLICY_LINK_STATUSES.has(a.status)) ||
      linksOf(b).high.length - linksOf(a).high.length ||
      linksOf(b).docs - linksOf(a).docs ||
      linksOf(b).flagged.length - linksOf(a).flagged.length ||
      Number(a.number) - Number(b.number) ||
      a.targetId.localeCompare(b.targetId),
  );
  const maxCount = ranked.reduce((m, r) => Math.max(m, linksOf(r).high.length), 0);
  const items: Nr7PolicyLinkItem[] = ranked.map((row) => {
    const links = linksOf(row);
    return {
      row,
      links,
      behind: POLICY_LINK_STATUSES.has(row.status),
      evidence: {
        kind: "policyLinks",
        count: links.high.length,
        max: maxCount,
        docs: links.docs,
        flagged: links.flagged.length,
        byDoc: links.byDoc.filter((d) => d.high > 0).map((d) => ({ doc: d.doc, high: d.high })),
      },
    };
  });
  const lead = items.filter((i) => i.behind && i.evidence.count > 0);
  return {
    items,
    recurring: recurringCounterparts(items),
    top: items.slice(0, cap),
    rest: items.slice(cap),
    total: items.length,
    hidden: Math.max(0, items.length - cap),
    candidates: candidates.length,
    lead,
    topFlaggedDoc: topFlaggedDoc(items),
    maxCount,
  };
}

/** The document with the most flagged pairs over every row (ties by id),
 *  with the total across all documents. Null when nothing is flagged. */
function topFlaggedDoc(items: Nr7PolicyLinkItem[]): Nr7PolicyLinkGroup["topFlaggedDoc"] {
  const byDoc = new Map<string, number>();
  let total = 0;
  for (const item of items) {
    for (const d of item.links.byDoc) {
      if (d.flagged === 0) continue;
      byDoc.set(d.doc, (byDoc.get(d.doc) ?? 0) + d.flagged);
      total += d.flagged;
    }
  }
  if (total === 0) return null;
  const [doc, flagged] = [...byDoc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return { doc, flagged, total };
}

/** The flagged pairs across the rows, turned round: per counterpart in
 *  another document, the national targets it is flagged against. A handful
 *  of expansion targets can account for most of the pairs (Mongolia: eight
 *  counterparts hold nearly half of 168), so one review of a counterpart
 *  settles the same question on every row it appears in. Only counterparts
 *  on RECURRING_MIN_TARGETS targets or more are listed; a pair on one row
 *  is that row's business. Deterministic. */
export function recurringCounterparts(items: Nr7PolicyLinkItem[], cap: number = RECURRING_CAP, min: number = RECURRING_MIN_TARGETS): Nr7RecurringGroup | null {
  const byCounterpart = new Map<string, Nr7RecurringCounterpart>();
  let totalPairs = 0;
  for (const item of items) {
    const hit: Nr7RecurringHit = { targetId: item.row.targetId, number: item.row.number, text: item.row.targetText, status: item.row.status, behind: item.behind };
    // A counterpart flagged twice against one NBSAP target (two pairs in the
    // alignment file) still hits that national target once.
    const seen = new Set<string>();
    for (const link of item.links.flagged) {
      totalPairs += 1;
      if (seen.has(link.targetId)) continue;
      seen.add(link.targetId);
      const entry = byCounterpart.get(link.targetId) ?? { targetId: link.targetId, doc: link.doc, label: link.label, text: link.text, hits: [], count: 0, behindCount: 0 };
      entry.hits.push(hit);
      byCounterpart.set(link.targetId, entry);
    }
  }
  const byBehindThenNumber = (a: Nr7RecurringHit, b: Nr7RecurringHit) =>
    Number(b.behind) - Number(a.behind) || Number(a.number) - Number(b.number) || a.targetId.localeCompare(b.targetId);
  const recurring = [...byCounterpart.values()]
    .map((c) => ({ ...c, hits: [...c.hits].sort(byBehindThenNumber), count: c.hits.length, behindCount: c.hits.filter((h) => h.behind).length }))
    .filter((c) => c.count >= min)
    .sort((a, b) => b.count - a.count || b.behindCount - a.behindCount || a.doc.localeCompare(b.doc) || a.label.localeCompare(b.label, undefined, { numeric: true }));
  if (recurring.length === 0) return null;
  const coveredPairs = recurring.reduce((s, c) => s + c.count, 0);
  let cumulative = 0;
  let toHalf = 0;
  for (const c of recurring) {
    if (cumulative >= totalPairs / 2) break;
    cumulative += c.count;
    toHalf += 1;
  }
  return {
    items: recurring,
    top: recurring.slice(0, cap),
    rest: recurring.slice(cap),
    total: recurring.length,
    hidden: Math.max(0, recurring.length - cap),
    totalPairs,
    coveredPairs,
    toHalf: cumulative >= totalPairs / 2 ? toHalf : 0,
    targets: items.length,
  };
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

function biodiversityGroup(model: Nr7ReportModel, cap: number, policyLinkCap: number = POLICY_LINK_CAP): BiodiversityReviewGroup {
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
  return { items, top, rest, total: model.signals.length, hidden: rest.length, policyLinks: rankPolicyLinkCandidates(model, policyLinkCap) };
}
