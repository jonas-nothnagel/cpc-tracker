/**
 * NR7 self-report model — the country's own 7th National Report to the CBD,
 * read three ways at once and joined to the coherence map.
 *
 * Everything here is arithmetic on what the country itself reported: the
 * progress rating per national target, the GBF questionnaire answers, and
 * the indicator series. No model is involved. The one number that is ours
 * is "policy reach": how many policy targets in the corpus align HIGH with
 * the NBSAP target a national target restates (from the pipeline's
 * target × target alignment, which the reader's document toggle filters).
 *
 * "Worth a closer look" signals are places where the report's own statements
 * point in different directions. They are review prompts, never verdicts:
 * each rule names numbers and years, and the copy that renders them never
 * carries a suggestion. Thresholds live in NR7_RULES so a change is one
 * line and visible in the README.
 */

import type {
  AlignmentResult,
  Nr7Data,
  Nr7Indicator,
  Nr7IndicatorSeries,
  Nr7ProgressItem,
  Nr7QuestionnaireAnswer,
  Target,
} from "@/types";

export const NR7_RULES = {
  /** ratingVsAnswers: share of scale answers that are under development or no. */
  NOT_IN_PLACE_SHARE: 0.5,
  /** ratingVsAnswers: fewer scale answers than this say nothing. */
  MIN_ANSWERS: 3,
  /** readSeries: |last − first| within this share of |first| reads as flat. */
  FLAT_TOLERANCE: 0.01,
  /** flatWhileOnTrack / sharedIndicatorDeclining: numeric points needed. */
  MIN_POINTS: 3,
  /** An indicator on at most this many targets is target-specific. */
  SPECIFIC_MAX_TARGETS: 3,
  /** An indicator on at least this many targets is shared (cross-cutting). */
  SHARED_INDICATOR_MIN_TARGETS: 4,
  /** reachWhileNoChange: reach at or above this quantile of matched targets. */
  REACH_QUANTILE: 0.75,
  /** Signals shown on the slide card. */
  CARD_CAP: 3,
} as const;

export type Nr7Status = Nr7ProgressItem["progressStatus"];
export type Nr7Direction = "up" | "down" | "flat" | "single" | "none";

export interface Nr7AnswerMix {
  yes: number;
  partially: number;
  underDevelopment: number;
  no: number;
  /** Enum and free-text answers, outside the scale. */
  other: number;
  /** Scale answers only. */
  answered: number;
}

export interface Nr7SeriesRead {
  indicatorId: string;
  /** "3.1 Coverage of protected areas", plus the disaggregation when any. */
  label: string;
  disaggregation: string | null;
  unit: string | null;
  direction: Nr7Direction;
  first: number | null;
  last: number | null;
  fromYear: number | null;
  toYear: number | null;
  /** Numeric points in the series. */
  points: number;
}

export type Nr7IndicatorGroup = "headline" | "other" | "noValues";

export interface Nr7IndicatorView extends Nr7Indicator {
  hasValues: boolean;
  /** One read per series, series order. */
  reads: Nr7SeriesRead[];
  /** Attached to SHARED_INDICATOR_MIN_TARGETS targets or more. */
  isShared: boolean;
  /** Attached to 1..SPECIFIC_MAX_TARGETS targets. */
  isSpecific: boolean;
  group: Nr7IndicatorGroup;
}

export interface Nr7TargetRow {
  targetId: string;
  /** "12" for NT12; drives labels such as "National target 12". */
  number: string;
  targetText: string;
  status: Nr7Status;
  levelOfProgress: string | null;
  /** Corpus id of the matching NBSAP target ("NBSAP_12"), legacy ids rewritten. */
  nbsapTargetId: string | null;
  nbsapNumber: string | null;
  answers: Nr7AnswerMix;
  scaleAnswers: Nr7QuestionnaireAnswer[];
  otherAnswers: Nr7QuestionnaireAnswer[];
  /** Scale answers that are under development or no. */
  notInPlace: Nr7QuestionnaireAnswer[];
  specificIndicatorIds: string[];
  sharedIndicatorIds: string[];
  /** Reads of the target-specific indicators' series. */
  reads: Nr7SeriesRead[];
  /** Policy targets aligned HIGH with the NBSAP target; null when unmatched. */
  policyReach: number | null;
  progressSummary: string | null;
  mainActionsSummary: string | null;
  keyChallengesSummary: string | null;
  actionEffectivenessSummary: string | null;
}

export type Nr7SignalRule =
  | "ratingVsAnswers"
  | "flatWhileOnTrack"
  | "unknownWithData"
  | "reachWhileNoChange"
  | "sharedIndicatorDeclining";

export interface Nr7Signal {
  rule: Nr7SignalRule;
  targetId?: string;
  indicatorId?: string;
  /** False for rules held back from the card until reviewed. */
  cardEligible: boolean;
  /** Values the copy interpolates; numbers pre-formatted where they are text. */
  params: Record<string, string | number>;
  /** Larger is stronger; orders signals within one rule. */
  strength: number;
}

export interface Nr7ReportTotals {
  targets: number;
  byStatus: Record<Nr7Status, number>;
  answers: number;
  targetsWithAnswers: number;
  indicators: number;
  indicatorsWithValues: number;
  indicatorsWithNote: number;
}

export interface Nr7ReportModel {
  country: string;
  publishedOn: string | null;
  sourceName: string | null;
  targets: Nr7TargetRow[];
  indicators: Nr7IndicatorView[];
  signals: Nr7Signal[];
  cardSignals: Nr7Signal[];
  totals: Nr7ReportTotals;
}

/** Rules that may reach the slide card, in priority order. The shared
 *  indicator rule is drawer-only until the reading of the funding series has
 *  been reviewed (decision 2026-09-09). */
const CARD_PRIORITY: Nr7SignalRule[] = [
  "ratingVsAnswers",
  "unknownWithData",
  "flatWhileOnTrack",
  "reachWhileNoChange",
];
const CARD_ELIGIBLE = new Set<Nr7SignalRule>(CARD_PRIORITY);

const STATUSES: Nr7Status[] = ["on_track", "limited", "no_progress", "unknown"];

// ── Helpers ─────────────────────────────────────────────────────────────────

export function targetNumber(targetId: string): string {
  const m = /^NT0*(\d+)$/.exec(targetId);
  return m ? m[1] : targetId;
}

/** "NBT_3" (PDF-era files) and "NBSAP_3" both map to the corpus id. */
export function normaliseNbsapId(id: string | null | undefined): string | null {
  if (!id) return null;
  return id.replace(/^NBT_/, "NBSAP_");
}

export function answerMix(answers: Nr7QuestionnaireAnswer[]): Nr7AnswerMix {
  const mix: Nr7AnswerMix = { yes: 0, partially: 0, underDevelopment: 0, no: 0, other: 0, answered: 0 };
  for (const a of answers) {
    switch (a.responseValue) {
      case "yes":
        mix.yes += 1;
        break;
      case "partially":
        mix.partially += 1;
        break;
      case "under_development":
        mix.underDevelopment += 1;
        break;
      case "no":
        mix.no += 1;
        break;
      default:
        mix.other += 1;
    }
  }
  mix.answered = mix.yes + mix.partially + mix.underDevelopment + mix.no;
  return mix;
}

export function indicatorLabel(indicator: Pick<Nr7Indicator, "code" | "name" | "title">): string {
  return indicator.code ? `${indicator.code} ${indicator.name}` : indicator.title;
}

/** Direction of one series from its first to its last numeric point. */
export function readSeries(indicator: Nr7Indicator, series: Nr7IndicatorSeries): Nr7SeriesRead {
  const numeric = series.points.filter((p): p is typeof p & { value: number } => p.value !== null);
  const base = {
    indicatorId: indicator.id,
    label: series.disaggregation
      ? `${indicatorLabel(indicator)} (${series.disaggregation})`
      : indicatorLabel(indicator),
    disaggregation: series.disaggregation,
    unit: series.unit,
    points: numeric.length,
  };
  if (numeric.length === 0) {
    return { ...base, direction: "none", first: null, last: null, fromYear: null, toYear: null };
  }
  const first = numeric[0];
  const last = numeric[numeric.length - 1];
  if (numeric.length === 1) {
    return { ...base, direction: "single", first: first.value, last: last.value, fromYear: first.year, toYear: last.year };
  }
  const delta = last.value - first.value;
  const tolerance = Math.abs(first.value) * NR7_RULES.FLAT_TOLERANCE;
  const direction: Nr7Direction = Math.abs(delta) <= tolerance ? "flat" : delta > 0 ? "up" : "down";
  return { ...base, direction, first: first.value, last: last.value, fromYear: first.year, toYear: last.year };
}

/** HIGH pairs between an NBSAP target and any other policy target, counted
 *  per NBSAP corpus id. Both sides must be in `targetMap` (visible targets). */
export function policyReachByNbsap(
  policyAlignment: AlignmentResult[],
  targetMap: Map<string, Target>,
): Map<string, number> {
  const reach = new Map<string, number>();
  for (const pair of policyAlignment) {
    if (pair.alignment !== "high") continue;
    const a = targetMap.get(pair.targetAId);
    const b = targetMap.get(pair.targetBId);
    if (!a || !b) continue;
    const aN = a.sourceDocument === "NBSAP";
    const bN = b.sourceDocument === "NBSAP";
    if (aN === bN) continue;
    const id = aN ? a.id : b.id;
    reach.set(id, (reach.get(id) ?? 0) + 1);
  }
  return reach;
}

/** "forTerrestrialPlanning" -> "for terrestrial planning"; "a; b" -> "a, b".
 *  Free text (contains spaces) is returned verbatim. */
export function humaniseAnswerCode(raw: string): string {
  const trimmed = raw.trim();
  if (/\s/.test(trimmed) && !trimmed.includes(";")) return trimmed;
  return trimmed
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      /\s/.test(part)
        ? part
        : part
            .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
            .replace(/_/g, " ")
            .toLowerCase(),
    )
    .join(", ");
}

const CODE_RE = /^([A-D])\.(?:CT\.)?(\d+)$|^(\d+)\.(\d+)$/;

/** Goal indicators (A.1 … D.3) first, then target indicators by number,
 *  then indicators without a code, by title. */
export function compareIndicatorIds(a: string, b: string): number {
  const ka = codeKey(a);
  const kb = codeKey(b);
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

function codeKey(id: string): [number, number, number, string] {
  const m = CODE_RE.exec(id);
  if (!m) return [2, 0, 0, id];
  if (m[1]) return [0, m[1].charCodeAt(0), Number(m[2]), id];
  return [1, Number(m[3]), Number(m[4]), id];
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const idx = Math.max(0, Math.ceil(q * sorted.length) - 1);
  return sorted[idx];
}

function shortText(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 24 ? cut.slice(0, space) : cut).replace(/[,.;:]$/, "")}…`;
}

function fmt(n: number | null): string {
  if (n === null) return "";
  // Three decimals: the Red List Index moves in the third place.
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

// ── Model ───────────────────────────────────────────────────────────────────

function buildIndicatorViews(indicators: Nr7Indicator[]): Nr7IndicatorView[] {
  return indicators
    .map((ind) => {
      const reads = ind.series.map((s) => readSeries(ind, s));
      const hasValues = reads.some((r) => r.points > 0) || ind.series.some((s) => s.points.some((p) => p.valueText));
      const n = ind.targetIds.length;
      return {
        ...ind,
        hasValues,
        reads,
        isShared: n >= NR7_RULES.SHARED_INDICATOR_MIN_TARGETS,
        isSpecific: n > 0 && n <= NR7_RULES.SPECIFIC_MAX_TARGETS,
        group: !hasValues ? "noValues" : ind.indicatorType === "headline" ? "headline" : "other",
      } satisfies Nr7IndicatorView;
    })
    .sort((a, b) => compareIndicatorIds(a.id, b.id));
}

function buildTargetRows(
  items: Nr7ProgressItem[],
  answers: Nr7QuestionnaireAnswer[],
  indicators: Nr7IndicatorView[],
  reach: Map<string, number>,
): Nr7TargetRow[] {
  const answersByTarget = new Map<string, Nr7QuestionnaireAnswer[]>();
  for (const a of answers) {
    const list = answersByTarget.get(a.targetId) ?? [];
    list.push(a);
    answersByTarget.set(a.targetId, list);
  }
  return [...items]
    .sort((a, b) => a.targetId.localeCompare(b.targetId, undefined, { numeric: true }))
    .map((item) => {
      const own = answersByTarget.get(item.targetId) ?? [];
      const scale = own.filter((a) => a.responseValue !== null);
      const other = own.filter((a) => a.responseValue === null);
      const attached = indicators.filter((ind) => ind.targetIds.includes(item.targetId));
      const specific = attached.filter((ind) => ind.isSpecific);
      const shared = attached.filter((ind) => ind.isShared);
      const nbsapId = normaliseNbsapId(item.nbsapTargetId);
      return {
        targetId: item.targetId,
        number: targetNumber(item.targetId),
        targetText: item.targetText,
        status: item.progressStatus,
        levelOfProgress: item.levelOfProgress ?? null,
        nbsapTargetId: nbsapId,
        nbsapNumber: nbsapId ? nbsapId.replace(/^NBSAP_/, "") : null,
        answers: answerMix(own),
        scaleAnswers: scale,
        otherAnswers: other,
        notInPlace: scale.filter(
          (a) => a.responseValue === "under_development" || a.responseValue === "no",
        ),
        specificIndicatorIds: specific.map((ind) => ind.id),
        sharedIndicatorIds: shared.map((ind) => ind.id),
        reads: specific.flatMap((ind) => ind.reads),
        policyReach: nbsapId ? (reach.get(nbsapId) ?? 0) : null,
        progressSummary: item.progressSummary ?? null,
        mainActionsSummary: item.mainActionsSummary ?? null,
        keyChallengesSummary: item.keyChallengesSummary ?? null,
        actionEffectivenessSummary: item.actionEffectivenessSummary ?? null,
      };
    });
}

export function detectSignals(rows: Nr7TargetRow[], indicators: Nr7IndicatorView[]): Nr7Signal[] {
  const signals: Nr7Signal[] = [];
  const reachValues = rows.filter((r) => r.policyReach !== null).map((r) => r.policyReach as number);
  const reachCut = quantile(reachValues, NR7_RULES.REACH_QUANTILE);
  const rowById = new Map(rows.map((r) => [r.targetId, r]));

  for (const row of rows) {
    const base = { id: row.targetId, n: row.number, text: shortText(row.targetText) };

    if (row.status === "on_track" && row.answers.answered >= NR7_RULES.MIN_ANSWERS) {
      const notInPlace = row.answers.underDevelopment + row.answers.no;
      const share = notInPlace / row.answers.answered;
      if (share >= NR7_RULES.NOT_IN_PLACE_SHARE) {
        signals.push({
          rule: "ratingVsAnswers",
          targetId: row.targetId,
          cardEligible: true,
          params: { ...base, notInPlace, answered: row.answers.answered },
          strength: share,
        });
      }
    }

    if (row.status === "on_track") {
      const flat = row.reads
        .filter((r) => r.direction === "flat" && r.points >= NR7_RULES.MIN_POINTS)
        .sort((a, b) => b.points - a.points)[0];
      if (flat) {
        signals.push({
          rule: "flatWhileOnTrack",
          targetId: row.targetId,
          indicatorId: flat.indicatorId,
          cardEligible: true,
          params: {
            ...base,
            indicator: flat.label,
            value: fmt(flat.last),
            unit: flat.unit ?? "",
            from: flat.fromYear ?? "",
            to: flat.toYear ?? "",
          },
          strength: flat.points,
        });
      }
    }

    if (row.status === "unknown") {
      // A rating of "unknown" next to reported values: the values exist, the
      // assessment does not. Series are often one point per disaggregation
      // (invasive species by taxon), so this counts points across the
      // indicator rather than reading a direction.
      const perIndicator = new Map<string, { points: number; from: number | null; to: number | null; label: string }>();
      for (const r of row.reads) {
        if (r.points === 0) continue;
        const cur = perIndicator.get(r.indicatorId) ?? { points: 0, from: null, to: null, label: r.label };
        cur.points += r.points;
        cur.from = cur.from === null ? r.fromYear : Math.min(cur.from, r.fromYear ?? cur.from);
        cur.to = cur.to === null ? r.toYear : Math.max(cur.to, r.toYear ?? cur.to);
        perIndicator.set(r.indicatorId, cur);
      }
      const [indicatorId, best] = [...perIndicator.entries()].sort((a, b) => b[1].points - a[1].points)[0] ?? [];
      if (indicatorId && best) {
        const ind = indicators.find((i) => i.id === indicatorId);
        signals.push({
          rule: "unknownWithData",
          targetId: row.targetId,
          indicatorId,
          cardEligible: true,
          params: {
            ...base,
            indicator: ind ? indicatorLabel(ind) : best.label,
            points: best.points,
            from: best.from ?? "",
            to: best.to ?? "",
          },
          strength: best.points,
        });
      }
    }

    if (
      row.status === "no_progress" &&
      row.policyReach !== null &&
      reachCut !== null &&
      row.policyReach >= reachCut
    ) {
      signals.push({
        rule: "reachWhileNoChange",
        targetId: row.targetId,
        cardEligible: true,
        params: { ...base, reach: row.policyReach },
        strength: row.policyReach,
      });
    }
  }

  for (const ind of indicators) {
    if (!ind.isShared) continue;
    const long = ind.reads.filter((r) => r.points >= NR7_RULES.MIN_POINTS);
    if (long.length === 0 || !long.every((r) => r.direction === "down")) continue;
    const total = long.find((r) => r.disaggregation === null) ?? long[0];
    const onTrack = ind.targetIds.filter((id) => rowById.get(id)?.status === "on_track").length;
    signals.push({
      rule: "sharedIndicatorDeclining",
      indicatorId: ind.id,
      cardEligible: false,
      params: {
        indicator: total.label,
        first: fmt(total.first),
        last: fmt(total.last),
        unit: total.unit ?? "",
        from: total.fromYear ?? "",
        to: total.toYear ?? "",
        targets: ind.targetIds.length,
        onTrack,
      },
      strength:
        total.first && total.last !== null ? Math.abs((total.last - total.first) / total.first) : 0,
    });
  }

  const order: Record<Nr7SignalRule, number> = {
    ratingVsAnswers: 0,
    unknownWithData: 1,
    flatWhileOnTrack: 2,
    reachWhileNoChange: 3,
    sharedIndicatorDeclining: 4,
  };
  return signals.sort(
    (a, b) =>
      order[a.rule] - order[b.rule] ||
      b.strength - a.strength ||
      (a.targetId ?? a.indicatorId ?? "").localeCompare(b.targetId ?? b.indicatorId ?? "", undefined, { numeric: true }),
  );
}

/** One signal per rule first (strongest of each, in priority order), then
 *  fill remaining slots in the same order. Deterministic. */
export function pickCardSignals(signals: Nr7Signal[], cap: number = NR7_RULES.CARD_CAP): Nr7Signal[] {
  const eligible = signals.filter((s) => s.cardEligible && CARD_ELIGIBLE.has(s.rule));
  const picked: Nr7Signal[] = [];
  for (const rule of CARD_PRIORITY) {
    if (picked.length >= cap) break;
    const best = eligible.find((s) => s.rule === rule && !picked.includes(s));
    if (best) picked.push(best);
  }
  for (const rule of CARD_PRIORITY) {
    for (const s of eligible) {
      if (picked.length >= cap) return picked;
      if (s.rule === rule && !picked.includes(s)) picked.push(s);
    }
  }
  return picked;
}

export function buildNr7Report(
  nr7Data: Nr7Data | null | undefined,
  policyAlignment: AlignmentResult[],
  targetMap: Map<string, Target>,
): Nr7ReportModel | null {
  if (!nr7Data || !nr7Data.progressItems || nr7Data.progressItems.length === 0) return null;
  const answers = nr7Data.questionnaire?.answers ?? [];
  const indicators = buildIndicatorViews(nr7Data.indicators ?? []);
  const reach = policyReachByNbsap(policyAlignment, targetMap);
  const targets = buildTargetRows(nr7Data.progressItems, answers, indicators, reach);
  const signals = detectSignals(targets, indicators);
  const cardSignals = pickCardSignals(signals);

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Nr7Status, number>;
  for (const row of targets) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  const publishedDates = nr7Data.progressItems.map((i) => i.publishedOn).filter((d): d is string => Boolean(d));

  return {
    country: nr7Data.country,
    publishedOn: nr7Data.source?.publishedOn ?? (publishedDates.length ? publishedDates.sort().at(-1)! : null),
    sourceName: nr7Data.source?.name ?? null,
    targets,
    indicators,
    signals,
    cardSignals,
    totals: {
      targets: targets.length,
      byStatus,
      answers: answers.length,
      targetsWithAnswers: new Set(answers.map((a) => a.targetId)).size,
      indicators: indicators.length,
      indicatorsWithValues: indicators.filter((i) => i.hasValues).length,
      indicatorsWithNote: indicators.filter((i) => !i.hasValues && Boolean(i.comments)).length,
    },
  };
}
