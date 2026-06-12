/**
 * Implementation coherence (Level 3) — what the BTR self-reports against the
 * plan.
 *
 * FRAMING (hard rule): this is the BTR lens, NOT "the implementation picture".
 * The Biennial Transparency Report is a partial, country-self-reported
 * document. Everything here describes what the BTR reports; copy must stay
 * source-anchored, with the one-lens caveat.
 *
 * THE MESSAGE this powers (one coverage map carrying BOTH readings): which
 * parts of the policy plan have at least one strongly aligned reported action,
 * whether that action is already under way or only on paper, which targets
 * have none in this report, AND which targets a reported action may pull
 * AGAINST (`computeImplementationCoverage`, with per-target `misalignments`
 * rendered as a red ring on the same dot). `computeActionPlanAlignment`
 * provides the headline counts for that counter-current read — review prompts,
 * never verdicts. `nr7StatusByNbsapTarget` maps the NR7 self-assessment onto
 * NBSAP target rows as a quiet contextual annotation. The right column
 * (`computeDeliveryRoster`) shows who is named on the reported actions —
 * NEUTRAL involvement as stated by the report, never a strain or blame
 * ranking (political-sensitivity guardrail).
 */

import type {
  AlignmentManageability,
  AlignmentResult,
  BTRAction,
  BTRActionType,
  BtrData,
  Target,
} from "@/types";

/** One policy commitment a reported action shows potential misalignment with. */
export interface StrainedCommitment {
  targetId: string;
  /** Short commitment label, e.g. "NBSAP 3". */
  targetLabel: string;
  /** Full commitment text (tooltip / detail). */
  targetText: string;
  /** Source document id (doc chip + colour). */
  doc: string;
  manageability: AlignmentManageability | null;
  /** The AI's rationale for the flag — the actual tension, not a count. */
  rationale: string;
}

/** A reported action with >= 1 potential misalignment against the plan. */
export interface StrainedAction {
  /** Pseudo-target id: "BTR_3" (mitigation, positional) | "ADP_3_1_1" (adaptation). */
  actionId: string;
  actionName: string;
  actionType: BTRActionType;
  /** Country-reported status (raw string, e.g. "Ongoing"). */
  status: string;
  /** True when the action is reported as ongoing or implemented. */
  underWay: boolean;
  /** Flagged action↔commitment pairs on this action. */
  potentialMisalignmentCount: number;
  /** Coordination-level (manageability === "manageable"). */
  manageableCount: number;
  /** Design-level (manageability === "fundamental"). */
  fundamentalCount: number;
  /** Institutions named on this action (who would coordinate). Sorted, deduped. */
  institutionLabels: string[];
  /** Commitments it strains, design-level first, then label order. */
  commitments: StrainedCommitment[];
}

export interface ActionPlanAlignmentSummary {
  /** Reported actions in the BTR (mitigation + adaptation). */
  totalActions: number;
  /** Reported actions with >= 1 flagged action↔commitment pair. */
  actionsWithPotentialMisalignment: number;
  /** Of those, actions already reported as ongoing or implemented. */
  actionsUnderWayWithMisalignment: number;
  /** Distinct policy commitments touched by >= 1 flagged pair. */
  flaggedCommitments: number;
  /** Flagged pairs with exactly one BTR side and a resolvable commitment. */
  totalFlaggedPairs: number;
  /** Coordination-level pairs (manageable). */
  manageablePairs: number;
  /** Design-level pairs (fundamental). */
  fundamentalPairs: number;
  /** All strained actions, most potential misalignments first. */
  rankedActions: StrainedAction[];
  /** Share (0..1) of all flagged pairs carried by the top `cap` actions. */
  topShare: number;
  /** Fewest actions whose flagged pairs cover half of all flagged pairs. */
  actionsToHalf: number;
}

const BTR_ID = /^(BTR|BTRA|ADP)_/;

/**
 * Mirror of the pipeline's id assignment in `measures_to_pseudo_targets`
 * (python/src/measure_align.py). The rules MUST match or evidence silently
 * attaches to the wrong action: rows with an empty name or status are
 * SKIPPED without consuming a sequence number; mitigation rows get
 * positional "BTR_{seq}"; adaptation rows keep a non-empty pre-assigned id
 * verbatim, else fall back to positional "BTRA_{seq}".
 */
export function buildActionMeta(
  btrData: BtrData,
): Map<string, { name: string; actionType: BTRActionType; measure: BTRAction }> {
  const map = new Map<
    string,
    { name: string; actionType: BTRActionType; measure: BTRAction }
  >();
  // One sequence per action type, mirroring the pipeline's SEPARATE
  // measures_to_pseudo_targets calls for the mitigation and adaptation lists.
  // The sequence advances for EVERY valid row of its type (also when a
  // pre-assigned id is honored), exactly like the pipeline's `seq`.
  let mitSeq = 0;
  let adpSeq = 0;
  for (const m of btrData.mitigationMeasures ?? []) {
    // Pipeline skip rule: no name or no status -> no pseudo-target, no seq.
    if (!(m.name ?? "").trim() || !(m.status ?? "").trim()) continue;
    const isAdapt = m.actionType === "adaptation";
    const seq = isAdapt ? (adpSeq += 1) : (mitSeq += 1);
    const preId = ((m as { id?: string }).id ?? "").trim();
    const id = preId || (isAdapt ? `BTRA_${seq}` : `BTR_${seq}`);
    map.set(id, {
      name: m.name,
      actionType: isAdapt ? "adaptation" : "mitigation",
      measure: m,
    });
  }
  return map;
}

function worstManageability(
  a: AlignmentManageability | null,
  b: AlignmentManageability | null,
): AlignmentManageability | null {
  if (a === "fundamental" || b === "fundamental") return "fundamental";
  if (a === "manageable" || b === "manageable") return "manageable";
  return null;
}

export function computeActionPlanAlignment(
  alignment: AlignmentResult[],
  btrData: BtrData,
  policyTargets: Target[],
  cap = 5,
  sourcedMap: Record<string, string> = SOURCED_ORG_EXPANSIONS,
): ActionPlanAlignmentSummary {
  const actionMeta = buildActionMeta(btrData);
  const policyById = new Map(policyTargets.map((t) => [t.id, t]));

  const perAction = new Map<
    string,
    {
      pairs: number;
      manageable: number;
      fundamental: number;
      commitments: Map<string, StrainedCommitment>;
    }
  >();
  let totalFlaggedPairs = 0;
  let manageablePairs = 0;
  let fundamentalPairs = 0;

  for (const pair of alignment) {
    if (pair.alignment !== "flagged") continue;
    const aBtr = BTR_ID.test(pair.targetAId);
    const bBtr = BTR_ID.test(pair.targetBId);
    if (aBtr === bBtr) continue; // exactly one BTR side
    const actionId = aBtr ? pair.targetAId : pair.targetBId;
    const policyId = aBtr ? pair.targetBId : pair.targetAId;
    const policy = policyById.get(policyId);
    if (!policy) continue;
    if (!actionMeta.has(actionId)) continue;

    totalFlaggedPairs += 1;
    const man = pair.manageability ?? null;
    if (man === "manageable") manageablePairs += 1;
    if (man === "fundamental") fundamentalPairs += 1;

    let entry = perAction.get(actionId);
    if (!entry) {
      entry = { pairs: 0, manageable: 0, fundamental: 0, commitments: new Map() };
      perAction.set(actionId, entry);
    }
    entry.pairs += 1;
    if (man === "manageable") entry.manageable += 1;
    if (man === "fundamental") entry.fundamental += 1;
    const prev = entry.commitments.get(policyId);
    entry.commitments.set(policyId, {
      targetId: policyId,
      targetLabel: policy.sourceLabel ?? policyId,
      targetText: policy.text,
      doc: policy.sourceDocument,
      manageability: worstManageability(prev?.manageability ?? null, man),
      rationale: prev?.rationale || pair.description || "",
    });
  }

  const rank = (m: AlignmentManageability | null) =>
    m === "fundamental" ? 0 : m === "manageable" ? 1 : 2;
  const rankByManageabilityThenLabel = (a: StrainedCommitment, b: StrainedCommitment) =>
    rank(a.manageability) - rank(b.manageability) ||
    a.targetLabel.localeCompare(b.targetLabel, undefined, { numeric: true });

  const rankedActions: StrainedAction[] = [...perAction.entries()]
    .map(([actionId, e]) => {
      const meta = actionMeta.get(actionId)!;
      const status = (meta.measure.status ?? "").trim();
      return {
        actionId,
        actionName: meta.name,
        actionType: meta.actionType,
        status,
        underWay: isUnderWay(status),
        potentialMisalignmentCount: e.pairs,
        manageableCount: e.manageable,
        fundamentalCount: e.fundamental,
        institutionLabels: orgLabelsFor(meta.measure, sourcedMap),
        commitments: [...e.commitments.values()].sort(rankByManageabilityThenLabel),
      };
    })
    .sort(
      (a, b) =>
        b.potentialMisalignmentCount - a.potentialMisalignmentCount ||
        a.actionName.localeCompare(b.actionName),
    );

  const actionsUnderWayWithMisalignment = rankedActions.filter(
    (a) => a.underWay,
  ).length;
  const flaggedCommitments = new Set(
    rankedActions.flatMap((a) => a.commitments.map((c) => c.targetId)),
  ).size;

  const topShare =
    totalFlaggedPairs > 0
      ? rankedActions
          .slice(0, cap)
          .reduce((s, a) => s + a.potentialMisalignmentCount, 0) / totalFlaggedPairs
      : 0;

  const half = totalFlaggedPairs / 2;
  let cumulative = 0;
  let actionsToHalf = 0;
  for (const a of rankedActions) {
    if (cumulative >= half || totalFlaggedPairs === 0) break;
    cumulative += a.potentialMisalignmentCount;
    actionsToHalf += 1;
  }

  return {
    totalActions: actionMeta.size,
    actionsWithPotentialMisalignment: rankedActions.length,
    actionsUnderWayWithMisalignment,
    flaggedCommitments,
    totalFlaggedPairs,
    manageablePairs,
    fundamentalPairs,
    rankedActions,
    topShare,
    actionsToHalf,
  };
}

// ── Institution helpers (named institutions = who would coordinate) ──────────

/**
 * Default (empty) acronym map: the REAL sourced registry lives in
 * `src/data/org-acronyms.ts` and is passed in explicitly by the briefing.
 * Do NOT add expansions here — they would only affect tests, never the app.
 * Values must trace to a primary source (the country BTR / APNDC abbreviation
 * list); unmapped abbreviations render as the raw string.
 */
export const SOURCED_ORG_EXPANSIONS: Record<string, string> = {};

const FOOTNOTE = /\s*\(\d+\)\s*$/;
const startsUpper = (s: string) => /^\p{Lu}/u.test(s);

/** Clean one raw institution token: strip a trailing footnote marker, collapse
 *  whitespace; expansion comes only from the sourced map (never invented). */
export function normalizeOrg(
  raw: string,
  sourcedMap: Record<string, string> = SOURCED_ORG_EXPANSIONS,
): { key: string; label: string; expanded: boolean } {
  const cleaned = raw.replace(FOOTNOTE, "").trim().replace(/\s+/g, " ");
  const key = cleaned.toLowerCase();
  const expansion = sourcedMap[key];
  return { key, label: expansion ?? cleaned, expanded: Boolean(expansion) };
}

/** Split an `implementingEntity` string on the institution delimiters seen in
 *  the data (`/`, ` / `, `;`). NOT comma — commas occur inside single names. */
export function splitInstitutions(raw: string): string[] {
  return raw
    .split(/\s*[/;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The institutions named on a reported action, normalised, deduped, sorted.
 *  Dedupe runs on the FINAL label (post sourced-map expansion), so a row that
 *  names the same ministry twice — acronym and full form — collapses to one
 *  entry instead of listing the expanded label twice. */
export function orgLabelsFor(
  m: BTRAction,
  sourcedMap: Record<string, string> = SOURCED_ORG_EXPANSIONS,
): string[] {
  const raws =
    m.actionType === "adaptation"
      ? (m.responsibleOrgs ?? [])
      : splitInstitutions(m.implementingEntity ?? "");
  const byCanonical = new Map<string, string>();
  for (const raw of raws) {
    const { key, label } = normalizeOrg(raw, sourcedMap);
    if (!key) continue;
    const canonical = label.toLowerCase();
    const current = byCanonical.get(canonical);
    if (!current) byCanonical.set(canonical, label);
    else if (startsUpper(label) && !startsUpper(current))
      byCanonical.set(canonical, label);
  }
  return [...byCanonical.values()].sort((a, b) => a.localeCompare(b));
}

// ── Country-reported status (lifecycle, not judgement) ───────────────────────

/** Country-reported status strings, in lifecycle (not judgement) order. */
export const STATUS_LIFECYCLE = ["planned", "adopted", "ongoing", "implemented"];

export const statusRank = (s: string): number => {
  const i = STATUS_LIFECYCLE.indexOf(s.trim().toLowerCase());
  return i === -1 ? -1 : i; // unknown strings rank below "planned"
};

/** "Under way or implemented" — the action is reported as moving, not only on
 *  paper. Unknown status strings conservatively count as NOT under way. */
export const isUnderWay = (s: string): boolean => {
  const k = s.trim().toLowerCase();
  return k === "ongoing" || k === "implemented";
};

// ── Coverage: which parts of the plan have a reported action ─────────────────

/** A reported action the AI flags as potentially misaligned with a target —
 *  the counter-current read on the same dot (rendered as a red ring). */
export interface TargetMisalignmentLink {
  actionId: string;
  actionName: string;
  actionType: BTRActionType;
  /** Country-reported status of the action (raw string, e.g. "Ongoing"). */
  actionStatus: string;
  /** True when the action is reported as ongoing or implemented. */
  actionUnderWay: boolean;
  manageability: AlignmentManageability | null;
  /** The AI's rationale for the potential misalignment. */
  rationale: string;
}

/** A strong (high) action↔target link: the evidence behind a filled dot. */
export interface ActionCoverageLink {
  targetId: string;
  /** Short commitment label, e.g. "NBSAP 3". */
  targetLabel: string;
  /** Full commitment text (tooltip / detail). */
  targetText: string;
  /** Pseudo-target id of the reported action ("BTR_3" | "ADP_3_1_1"). */
  actionId: string;
  actionName: string;
  actionType: BTRActionType;
  /** Country-reported status of the action (raw string, e.g. "Ongoing"). */
  actionStatus: string;
  /** True when the action is reported as ongoing or implemented. */
  actionUnderWay: boolean;
  /** The AI's reasoning for the link (the evidence behind the dot). */
  rationale: string;
  /** Institutions named on the action (neutral context, never a ranking). */
  institutionLabels: string[];
  /** Reported actions that may pull AGAINST this target (red ring when any). */
  misalignments: TargetMisalignmentLink[];
}

/** A target no reported action strongly aligns with: none in this report. */
export interface ActionUncoveredTarget {
  targetId: string;
  targetLabel: string;
  targetText: string;
  /** Reported actions that may pull AGAINST this target (red ring when any). */
  misalignments: TargetMisalignmentLink[];
}

export interface ActionCoverageDoc {
  /** Source document type (e.g. "NBSAP"). */
  doc: string;
  /** Targets in this document with >= 1 strongly aligned reported action. */
  reached: number;
  /** Targets in this document. */
  total: number;
  /** Targets in this document with >= 1 potentially misaligned action. */
  flaggedTargets: number;
  /** One strong link per reached target (the evidence), by label. */
  links: ActionCoverageLink[];
  /** Pure complement of `links`: links.length + uncovered.length === total. */
  uncovered: ActionUncoveredTarget[];
}

export interface ImplementationCoverage {
  /** Visible targets with >= 1 strongly aligned reported action. */
  reached: number;
  /** Reached targets whose best aligned action is ongoing or implemented. */
  reachedUnderWay: number;
  /** Visible targets total. */
  total: number;
  /** Visible targets with none in this report (= total - reached). */
  outsideReach: number;
  /** Distinct reported actions in the BTR (mitigation + adaptation). */
  totalActions: number;
  mitigationActions: number;
  adaptationActions: number;
  /**
   * True when the alignment array carries ANY measure↔target pair (at any
   * level). False means the action-to-target match has not been computed for
   * this corpus (possible on the upload path) — distinct from "computed, zero
   * strong matches", which is a real finding.
   */
  hasMeasureAlignment: boolean;
  /** Visible targets with >= 1 potentially misaligned reported action. */
  targetsWithMisalignment: number;
  /** Per-document breakdown, largest document first. */
  byDocument: ActionCoverageDoc[];
}

/**
 * How far the BTR's reported actions REACH into the policy plan, via the
 * pipeline's measure↔target alignment. We count only HIGH links — medium marks
 * ~99% of targets in both pilot corpora and would wash out the signal (same
 * rule as `computeBudgetCoverage`). So a target is "addressed" when at least
 * one reported action aligns HIGH with it. This says a reported action EXISTS
 * for the target, not that the target is on track — AI-estimated, indicative.
 * Mirrors `computeBudgetCoverage` (financing-coherence.ts) so L2 and L3 read
 * with the same visual grammar — but with a third dot state: the evidence link
 * per target is the aligned action with the MOST ADVANCED country-reported
 * status, so the dot can honestly say "action under way" vs "action only
 * planned or adopted so far".
 */
export function computeImplementationCoverage(
  alignment: AlignmentResult[],
  btrData: BtrData,
  visibleTargets: Target[],
  sourcedMap: Record<string, string> = SOURCED_ORG_EXPANSIONS,
): ImplementationCoverage {
  const actionMeta = buildActionMeta(btrData);
  const targetById = new Map(visibleTargets.map((t) => [t.id, t]));

  // Best high link per covered target: the aligned action with the most
  // advanced lifecycle status wins (ties: first encountered). One piece of
  // evidence per dot, carrying the honest delivery stage. The SAME pass also
  // collects the counter-current read: flagged pairs, i.e. reported actions
  // that may pull AGAINST a target (deduped per action, worst manageability).
  const linkByTarget = new Map<string, ActionCoverageLink>();
  const flaggedByTarget = new Map<string, Map<string, TargetMisalignmentLink>>();
  let hasMeasureAlignment = false;
  for (const pair of alignment) {
    const aBtr = BTR_ID.test(pair.targetAId);
    const bBtr = BTR_ID.test(pair.targetBId);
    if (aBtr === bBtr) continue; // exactly one measure side
    hasMeasureAlignment = true;
    if (pair.alignment !== "high" && pair.alignment !== "flagged") continue;
    const actionId = aBtr ? pair.targetAId : pair.targetBId;
    const policyId = aBtr ? pair.targetBId : pair.targetAId;
    const meta = actionMeta.get(actionId);
    if (!meta) continue;
    const target = targetById.get(policyId);
    if (!target) continue;
    const status = (meta.measure.status ?? "").trim();

    if (pair.alignment === "flagged") {
      let perTarget = flaggedByTarget.get(policyId);
      if (!perTarget) {
        perTarget = new Map();
        flaggedByTarget.set(policyId, perTarget);
      }
      const prev = perTarget.get(actionId);
      perTarget.set(actionId, {
        actionId,
        actionName: meta.name,
        actionType: meta.actionType,
        actionStatus: status,
        actionUnderWay: isUnderWay(status),
        manageability: worstManageability(
          prev?.manageability ?? null,
          pair.manageability ?? null,
        ),
        rationale: prev?.rationale || pair.description || "",
      });
      continue;
    }

    const existing = linkByTarget.get(policyId);
    if (existing && statusRank(existing.actionStatus) >= statusRank(status))
      continue;
    linkByTarget.set(policyId, {
      targetId: policyId,
      targetLabel: target.sourceLabel ?? policyId,
      targetText: target.text,
      actionId,
      actionName: meta.name,
      actionType: meta.actionType,
      actionStatus: status,
      actionUnderWay: isUnderWay(status),
      rationale: pair.description ?? "",
      institutionLabels: orgLabelsFor(meta.measure, sourcedMap),
      misalignments: [],
    });
  }

  // Moving flagged actions first (the "already happening" signal), then
  // design-level, then name.
  const rankFlagged = (a: TargetMisalignmentLink, b: TargetMisalignmentLink) =>
    Number(b.actionUnderWay) - Number(a.actionUnderWay) ||
    Number(b.manageability === "fundamental") -
      Number(a.manageability === "fundamental") ||
    a.actionName.localeCompare(b.actionName);
  const misalignmentsFor = (targetId: string): TargetMisalignmentLink[] =>
    [...(flaggedByTarget.get(targetId)?.values() ?? [])].sort(rankFlagged);

  const docs = new Map<
    string,
    { total: number; links: ActionCoverageLink[]; uncovered: ActionUncoveredTarget[] }
  >();
  let targetsWithMisalignment = 0;
  for (const t of visibleTargets) {
    const entry = docs.get(t.sourceDocument) ?? {
      total: 0,
      links: [],
      uncovered: [],
    };
    entry.total += 1;
    const misalignments = misalignmentsFor(t.id);
    if (misalignments.length > 0) targetsWithMisalignment += 1;
    const link = linkByTarget.get(t.id);
    if (link) {
      entry.links.push({ ...link, misalignments });
    } else {
      entry.uncovered.push({
        targetId: t.id,
        targetLabel: t.sourceLabel ?? t.id,
        targetText: t.text,
        misalignments,
      });
    }
    docs.set(t.sourceDocument, entry);
  }

  const byLabel = (a: { targetLabel: string }, b: { targetLabel: string }) =>
    a.targetLabel.localeCompare(b.targetLabel, undefined, { numeric: true });
  // Under-way links first so each dot row reads full → light → hollow.
  const byStageThenLabel = (a: ActionCoverageLink, b: ActionCoverageLink) =>
    Number(b.actionUnderWay) - Number(a.actionUnderWay) || byLabel(a, b);

  const byDocument: ActionCoverageDoc[] = [...docs.entries()]
    .map(([doc, v]) => ({
      doc,
      reached: v.links.length,
      total: v.total,
      flaggedTargets:
        v.links.filter((l) => l.misalignments.length > 0).length +
        v.uncovered.filter((u) => u.misalignments.length > 0).length,
      links: v.links.sort(byStageThenLabel),
      uncovered: v.uncovered.sort(byLabel),
    }))
    .sort((a, b) => b.total - a.total || a.doc.localeCompare(b.doc));

  let mitigationActions = 0;
  let adaptationActions = 0;
  for (const meta of actionMeta.values()) {
    if (meta.actionType === "adaptation") adaptationActions += 1;
    else mitigationActions += 1;
  }

  let reachedUnderWay = 0;
  for (const link of linkByTarget.values()) {
    if (link.actionUnderWay) reachedUnderWay += 1;
  }

  return {
    reached: linkByTarget.size,
    reachedUnderWay,
    total: visibleTargets.length,
    outsideReach: visibleTargets.length - linkByTarget.size,
    totalActions: actionMeta.size,
    mitigationActions,
    adaptationActions,
    hasMeasureAlignment,
    targetsWithMisalignment,
    byDocument,
  };
}

// ── The delivery roster (right-column centerpiece) ───────────────────────────

export interface RosterStatusCount {
  /** Raw country-reported status string (e.g. "Adopted"). */
  status: string;
  count: number;
}

export interface RosterAction {
  id: string;
  name: string;
  status: string;
  actionType: BTRActionType;
}

/** An institution named on >= 1 reported action. Counted by DISTINCT action:
 *  an action naming several institutions counts once for each (shared
 *  responsibility), so counts read as INVOLVEMENT, never shares of a whole. */
export interface RosterInstitution {
  /** Canonical dedupe key (lowercased canonical label). */
  key: string;
  /** Canonical display label (sourced expansion when available, else raw). */
  label: string;
  /** This institution's reported actions, most advanced status first. */
  actions: RosterAction[];
}

export interface DeliveryRosterModel {
  totalActions: number;
  mitigationCount: number;
  adaptationCount: number;
  /** Lifecycle order (Planned, Adopted, Ongoing, Implemented, then others). */
  statusMix: RosterStatusCount[];
  /** Institutions named on reported actions, most actions first. */
  institutions: RosterInstitution[];
  /** Reported actions naming no institution at all. */
  actionsWithoutInstitution: number;
}

/**
 * Who delivers what the report contains: every institution named on a reported
 * action (mitigation `implementingEntity`, adaptation `responsibleOrgs`),
 * with that institution's actions as status-coloured dots. NEUTRAL involvement
 * as stated by the country's own report — never a strain or blame ranking
 * (political-sensitivity guardrail). Acronym/full-name duplicates collapse via
 * the sourced per-country map only where confirmed.
 */
export function computeDeliveryRoster(
  btrData: BtrData,
  sourcedMap: Record<string, string> = SOURCED_ORG_EXPANSIONS,
): DeliveryRosterModel {
  const actionMeta = buildActionMeta(btrData); // one source of truth for ids

  const statusCounts = new Map<string, { status: string; count: number }>();
  let mitigationCount = 0;
  let adaptationCount = 0;
  const byInstitution = new Map<string, { label: string; actions: RosterAction[] }>();
  let actionsWithoutInstitution = 0;

  for (const [id, meta] of actionMeta) {
    const m = meta.measure;
    if (meta.actionType === "adaptation") adaptationCount += 1;
    else mitigationCount += 1;

    const status = (m.status ?? "").trim();
    const statusKey = status.toLowerCase();
    const entry = statusCounts.get(statusKey) ?? { status, count: 0 };
    entry.count += 1;
    statusCounts.set(statusKey, entry);

    const action: RosterAction = {
      id,
      name: m.name,
      status,
      actionType: meta.actionType,
    };
    const labels = orgLabelsFor(m, sourcedMap);
    if (labels.length === 0) {
      actionsWithoutInstitution += 1;
      continue;
    }
    for (const label of labels) {
      const key = label.toLowerCase();
      const node = byInstitution.get(key) ?? { label, actions: [] };
      node.actions.push(action);
      byInstitution.set(key, node);
    }
  }

  const statusMix: RosterStatusCount[] = [...statusCounts.entries()]
    .map(([key, v]) => ({ status: v.status, count: v.count, key }))
    .sort(
      (a, b) =>
        statusRank(b.key) - statusRank(a.key) ||
        b.count - a.count ||
        a.status.localeCompare(b.status),
    )
    .map(({ status, count }) => ({ status, count }));

  const byStatusThenName = (a: RosterAction, b: RosterAction) =>
    statusRank(b.status) - statusRank(a.status) || a.name.localeCompare(b.name);

  const institutions: RosterInstitution[] = [...byInstitution.entries()]
    .map(([key, n]) => ({
      key,
      label: n.label,
      actions: n.actions.sort(byStatusThenName),
    }))
    .sort(
      (a, b) =>
        b.actions.length - a.actions.length || a.label.localeCompare(b.label),
    );

  return {
    totalActions: actionMeta.size,
    mitigationCount,
    adaptationCount,
    statusMix,
    institutions,
    actionsWithoutInstitution,
  };
}

// ── Institution → policy-document flow (Sankey) ──────────────────────────────

export interface InstitutionFlowTarget {
  targetId: string;
  /** Short commitment label (e.g. "NBSAP 3"). */
  targetLabel: string;
  /** Representative reported action (most advanced status) so a target row can
   *  open the shared drawer on a pair that exists in the alignment array. */
  actionId: string;
}

export interface InstitutionFlowLink {
  /** Lowercased canonical institution key (or the reserved Other key). */
  institutionKey: string;
  /** Source document of the supported targets. */
  doc: string;
  /** Distinct policy targets in `doc` this institution's actions support. */
  value: number;
  /** The supported targets, by label. */
  targets: InstitutionFlowTarget[];
}

export interface InstitutionFlowNode {
  key: string;
  label: string;
  /** Distinct supported targets (the deterministic sum of this node's links). */
  value: number;
  /** True for the bundled catch-all node; the UI localizes its label. */
  isOther?: boolean;
}

export interface InstitutionFlowDoc {
  doc: string;
  /** Involvement total: sum of incoming links (a target supported by two
   *  institutions counts under each), so it never reads as a share of a whole. */
  value: number;
}

export interface InstitutionFlowModel {
  /** True when the alignment array carries ANY measure↔target pair (see
   *  `computeImplementationCoverage`). */
  hasMeasureAlignment: boolean;
  /** Institution nodes, most distinct supported targets first, with the Other
   *  bundle (when present) last. */
  institutions: InstitutionFlowNode[];
  /** Document nodes, largest involvement first. */
  documents: InstitutionFlowDoc[];
  /** Institution→document flows. */
  links: InstitutionFlowLink[];
  /** Distinct policy targets with >= 1 strongly aligned, institution-attributed
   *  reported action. */
  totalSupportedTargets: number;
  /** Of those, distinct targets supported by actions from >= 2 distinct
   *  institutions — a neutral coordination signal, never a ranking. */
  coordinationTargets: number;
  /** Real institutions folded into the Other node (0 when none). */
  bundledInstitutions: number;
}

const OTHER_INSTITUTION_KEY = "__other__";

/**
 * Where the BTR's reported implementation effort REACHES into the policy plan,
 * institution by institution: for each named institution, the policy documents
 * (and, on drill-down, the targets) its reported actions align HIGH with — so a
 * pattern like "this ministry's actions land mostly on the NDC" reads off the
 * flow.
 *
 * FRESH pass over the alignment (NOT the deduped per-target link of
 * `computeImplementationCoverage`, which keeps one action per target and would
 * drop the other institutions on a multi-institution target). A target
 * supported by actions from several institutions attributes to EACH of them —
 * involvement as stated by the report, never a strain or blame ranking
 * (political-sensitivity guardrail). HIGH-only, mirroring the coverage dot-map.
 * Institutions are capped to `maxInstitutions` by distinct supported targets,
 * with the remainder folded into a neutral Other node so the flow stays legible
 * on larger corpora (e.g. Panama).
 */
export function computeInstitutionFlow(
  alignment: AlignmentResult[],
  btrData: BtrData,
  visibleTargets: Target[],
  sourcedMap: Record<string, string> = SOURCED_ORG_EXPANSIONS,
  maxInstitutions = 8,
): InstitutionFlowModel {
  const actionMeta = buildActionMeta(btrData);
  const targetById = new Map(visibleTargets.map((t) => [t.id, t]));

  type Rep = { targetLabel: string; actionId: string; rank: number };
  // institutionKey -> doc -> (targetId -> best-status representative). Nested
  // maps so a multi-word institution label or doc token never needs escaping.
  const docsByInst = new Map<string, Map<string, Map<string, Rep>>>();
  const labelByKey = new Map<string, string>();
  // targetId -> distinct institution keys (coordination + distinct total)
  const instByTarget = new Map<string, Set<string>>();
  let hasMeasureAlignment = false;

  for (const pair of alignment) {
    const aBtr = BTR_ID.test(pair.targetAId);
    const bBtr = BTR_ID.test(pair.targetBId);
    if (aBtr === bBtr) continue; // exactly one measure side
    hasMeasureAlignment = true;
    if (pair.alignment !== "high") continue;
    const actionId = aBtr ? pair.targetAId : pair.targetBId;
    const policyId = aBtr ? pair.targetBId : pair.targetAId;
    const meta = actionMeta.get(actionId);
    if (!meta) continue;
    const target = targetById.get(policyId);
    if (!target) continue;
    const labels = orgLabelsFor(meta.measure, sourcedMap);
    if (labels.length === 0) continue; // unattributed: cannot place in the flow
    const doc = target.sourceDocument;
    const rank = statusRank((meta.measure.status ?? "").trim());
    const targetLabel = target.sourceLabel ?? policyId;

    let instSet = instByTarget.get(policyId);
    if (!instSet) {
      instSet = new Set();
      instByTarget.set(policyId, instSet);
    }
    for (const label of labels) {
      const key = label.toLowerCase();
      labelByKey.set(key, label);
      instSet.add(key);
      let docs = docsByInst.get(key);
      if (!docs) {
        docs = new Map();
        docsByInst.set(key, docs);
      }
      let reps = docs.get(doc);
      if (!reps) {
        reps = new Map();
        docs.set(doc, reps);
      }
      const prev = reps.get(policyId);
      if (!prev || rank > prev.rank) {
        reps.set(policyId, { targetLabel, actionId, rank });
      }
    }
  }

  // Per institution: distinct-target total across its docs.
  const totalByInst = new Map<string, number>();
  for (const [key, docs] of docsByInst) {
    let total = 0;
    for (const reps of docs.values()) total += reps.size;
    totalByInst.set(key, total);
  }

  const toTargets = (reps: Map<string, Rep>): InstitutionFlowTarget[] =>
    [...reps.entries()]
      .map(([targetId, r]) => ({
        targetId,
        targetLabel: r.targetLabel,
        actionId: r.actionId,
      }))
      .sort((a, b) =>
        a.targetLabel.localeCompare(b.targetLabel, undefined, { numeric: true }),
      );
  const sortLinks = (ls: InstitutionFlowLink[]) =>
    ls.sort((a, b) => b.value - a.value || a.doc.localeCompare(b.doc));

  const ranked = [...totalByInst.entries()].sort(
    (a, b) =>
      b[1] - a[1] || labelByKey.get(a[0])!.localeCompare(labelByKey.get(b[0])!),
  );
  const top = ranked.slice(0, maxInstitutions);
  const bundled = ranked.slice(maxInstitutions);

  const institutions: InstitutionFlowNode[] = [];
  const links: InstitutionFlowLink[] = [];

  for (const [key, total] of top) {
    institutions.push({ key, label: labelByKey.get(key)!, value: total });
    const instLinks = [...docsByInst.get(key)!.entries()].map(([doc, reps]) => ({
      institutionKey: key,
      doc,
      value: reps.size,
      targets: toTargets(reps),
    }));
    links.push(...sortLinks(instLinks));
  }

  if (bundled.length > 0) {
    // Fold the remainder into one neutral node: distinct targets per doc across
    // the group (deduped, most-advanced representative wins).
    const otherDocs = new Map<string, Map<string, Rep>>();
    for (const [key] of bundled) {
      for (const [doc, reps] of docsByInst.get(key)!) {
        let agg = otherDocs.get(doc);
        if (!agg) {
          agg = new Map();
          otherDocs.set(doc, agg);
        }
        for (const [targetId, r] of reps) {
          const prev = agg.get(targetId);
          if (!prev || r.rank > prev.rank) agg.set(targetId, r);
        }
      }
    }
    let otherTotal = 0;
    const otherLinks = [...otherDocs.entries()].map(([doc, reps]) => {
      otherTotal += reps.size;
      return {
        institutionKey: OTHER_INSTITUTION_KEY,
        doc,
        value: reps.size,
        targets: toTargets(reps),
      };
    });
    institutions.push({
      key: OTHER_INSTITUTION_KEY,
      label: "Other",
      value: otherTotal,
      isOther: true,
    });
    links.push(...sortLinks(otherLinks));
  }

  // Document involvement totals from the rendered links, so node heights match
  // the ribbons exactly.
  const docValue = new Map<string, number>();
  for (const link of links) {
    docValue.set(link.doc, (docValue.get(link.doc) ?? 0) + link.value);
  }
  const documents: InstitutionFlowDoc[] = [...docValue.entries()]
    .map(([doc, value]) => ({ doc, value }))
    .sort((a, b) => b.value - a.value || a.doc.localeCompare(b.doc));

  let coordinationTargets = 0;
  for (const set of instByTarget.values()) {
    if (set.size >= 2) coordinationTargets += 1;
  }

  return {
    hasMeasureAlignment,
    institutions,
    documents,
    links,
    totalSupportedTargets: instByTarget.size,
    coordinationTargets,
    bundledInstitutions: bundled.length,
  };
}

// ── NR7 annotation: the country's own assessment, in target context ──────────

/** NR7 statuses by progress, least first. When two national targets map to
 *  one NBSAP target, the annotation keeps the LEAST-progress status (the gap
 *  signal leads; the full picture stays in the NR7 itself). */
const NR7_PROGRESS_ORDER = ["no_progress", "limited", "unknown", "on_track"];
const nr7ProgressRank = (s: string) => {
  const i = NR7_PROGRESS_ORDER.indexOf(s);
  return i === -1 ? NR7_PROGRESS_ORDER.length : i;
};

/**
 * Map the NR7 self-assessment onto the NBSAP target ids used in the corpus
 * (`nbsapTargetId` "NBT_3" → target id "NBSAP_3"; verified 20/20 on the
 * Mongolia data, where NBT_3 carries two national targets and collapses to
 * the least-progress status). Rendered as a quiet one-line annotation on the
 * matching target rows of the coverage detail — contextual, never a separate
 * block.
 */
export function nr7StatusByNbsapTarget(
  progressItems: { progressStatus: string; nbsapTargetId?: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const it of progressItems) {
    const mappedId = (it.nbsapTargetId ?? "").replace(/^NBT_/, "NBSAP_");
    if (!mappedId) continue;
    const prev = map.get(mappedId);
    if (!prev || nr7ProgressRank(it.progressStatus) < nr7ProgressRank(prev)) {
      map.set(mappedId, it.progressStatus);
    }
  }
  return map;
}
