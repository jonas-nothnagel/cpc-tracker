/**
 * Pure detectors for "surprising" structural patterns in the coherence
 * dataset. Runs on the same data the chat already has, no LLM call required.
 *
 * Powers the first-load AI hook and the Surprise-me follow-up chip. Each
 * detector returns a 1-2 sentence factual callout plus the navigation action
 * that surfaces the underlying view, so "Show me" is instant — no roundtrip.
 *
 * Discipline matches the chat's:
 *   - no em dashes (commas, colons, periods only)
 *   - every number quoted must be derived from the data passed in
 *   - pathway lines (optional) carry a brief, hedged "worth a closer
 *     look" thought rooted in the same evidence. Never prescriptive,
 *     never country-specific. Render is a quiet italic line beneath the
 *     callout, not a stacked block.
 */

import { isContradiction } from "@/types";
import { getDocLabel } from "@/lib/utils";
import { aggregateAnchorCoverage } from "@/lib/vision-anchor";
import type {
  AlignmentResult,
  BtrData,
  CountryConfig,
  PolicyDocumentType,
  Target,
  ThematicClassification,
} from "@/types";

import type { ChatAction, ChatTaxCategory } from "@/lib/coherence-chat";

type InsightPattern =
  | "implementation_contradiction"
  | "anchor_support_gap"
  | "sector_coverage_gap"
  | "paradox"
  | "orphan"
  | "zero_conflict_topic"
  | "tension_cluster"
  | "hub"
  | "imbalance"
  | "most_contested_topic"
  | "quantitative_gap"
  | "agreement_pair"
  | "most_aligned_target"
  | "doc_most_tensions"
  | "btr_status_mix"
  | "quantitative_coverage";

export interface Insight {
  pattern: InsightPattern;
  /** 1-2 sentence factual callout. No em dashes. This is the English fallback;
   *  the renderer prefers `explorer.insights.<pattern>.callout` with `vars`
   *  when that message exists (es/mn localization), else shows this verbatim. */
  callout: string;
  /**
   * Optional hedged pathway hint shown as a quiet italic line beneath the
   * callout. Only the detectors with a very clear, deterministic next
   * thought emit this; others stay factual-only. Always hedged
   * ("could potentially", "may", "worth a closer look"), never
   * prescriptive or country-specific.
   */
  pathway?: string;
  /** Interpolation values for the localized `explorer.insights.<pattern>.*`
   *  messages (es/mn). When set and the message exists, the renderer shows the
   *  localized string; otherwise it falls back to the English `callout`/`pathway`
   *  above. Keys mirror the ICU placeholders (e.g. `{label}`, `{count}`). */
  vars?: Record<string, string | number>;
  /** Action(s) to dispatch when the user clicks Show me. */
  actions: ChatAction[];
  /**
   * Optional preset filter for the suggested view. Applied alongside actions.
   * Kept here rather than inside actions so the dispatcher can ignore it
   * cleanly if it doesn't apply.
   */
  filter?: string;
  /**
   * Briefing-only: the specific target this insight is about, when it names
   * one (e.g. "N contradictions converge on X"). The briefing's "Show me"
   * uses it to refocus the wheel on the target's document and open its
   * flag-profile decomposition. Additive: the dashboard explorer dispatches
   * `actions` and ignores this, so its behaviour is unchanged.
   */
  subjectTargetId?: string;
}

interface DetectArgs {
  targets: Target[];
  /** Full alignment list, regardless of visibility. Detectors are coarse-grained
   *  and benefit from the full dataset; the UI handles visibility separately. */
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: ChatTaxCategory[];
  globeCategories: ChatTaxCategory[];
  btrData?: BtrData | null;
  availableDocs: PolicyDocumentType[];
  countryConfig?: CountryConfig | null;
}

/**
 * Run every detector and return the resulting insights in interestingness
 * order. Implementation contradictions come first because they're the
 * sharpest signal in a policy-coherence dataset: a reported action that
 * contradicts a plan is qualitatively different from two plans on paper
 * disagreeing. Paradox, cluster, and topic-level insights follow.
 */
export function detectInsights(args: DetectArgs): Insight[] {
  const out: Insight[] = [];
  const implContradiction = detectImplementationContradiction(args);
  if (implContradiction) out.push(implContradiction);
  const anchorGap = detectAnchorSupportGap(args);
  if (anchorGap) out.push(anchorGap);
  const sectorGap = detectSectorCoverageGap(args);
  if (sectorGap) out.push(sectorGap);
  const paradox = detectParadox(args);
  if (paradox) out.push(paradox);
  const cluster = detectTensionCluster(args);
  if (cluster) out.push(cluster);
  const mostContested = detectMostContestedTopic(args);
  if (mostContested) out.push(mostContested);
  const docMostTensions = detectDocWithMostTensions(args);
  if (docMostTensions) out.push(docMostTensions);
  const zero = detectZeroConflictTopic(args);
  if (zero) out.push(zero);
  const hub = detectHub(args);
  if (hub) out.push(hub);
  const mostAligned = detectMostAlignedTarget(args);
  if (mostAligned) out.push(mostAligned);
  const quantGap = detectQuantitativeGap(args);
  if (quantGap) out.push(quantGap);
  const orphan = detectOrphan(args);
  if (orphan) out.push(orphan);
  const imbalance = detectImbalance(args);
  if (imbalance) out.push(imbalance);
  const agreement = detectAgreementPair(args);
  if (agreement) out.push(agreement);
  const btrStatus = detectBtrStatusMix(args);
  if (btrStatus) out.push(btrStatus);
  const quantCoverage = detectQuantitativeCoverage(args);
  if (quantCoverage) out.push(quantCoverage);
  return out;
}

/**
 * BTR pseudo-targets carry an extra `measureStatus` field that's not in
 * the strict Target type. Cast helper for safe access without widening the
 * public type.
 */
interface PseudoExtras {
  measureStatus?: string;
}

// ─── Detectors ──────────────────────────────────────────────────────

/**
 * Paradox: a single target that ranks both in the top-5 most-contested AND
 * the top-5 most-aligned. Rare and counter-intuitive, a great hook.
 */
function detectParadox(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const tension = new Map<string, number>();
  const align = new Map<string, number>();
  for (const a of alignment) {
    if (isContradiction(a.alignment)) {
      tension.set(a.targetAId, (tension.get(a.targetAId) ?? 0) + 1);
      tension.set(a.targetBId, (tension.get(a.targetBId) ?? 0) + 1);
    } else if (a.alignment === "high") {
      align.set(a.targetAId, (align.get(a.targetAId) ?? 0) + 1);
      align.set(a.targetBId, (align.get(a.targetBId) ?? 0) + 1);
    }
  }
  const topT = topN([...tension.entries()], 5).map(([id]) => id);
  const topA = topN([...align.entries()], 5).map(([id]) => id);
  const inBoth = topT.filter((id) => topA.includes(id));
  if (inBoth.length === 0) return null;
  // Prefer the target with the highest combined count.
  inBoth.sort((a, b) => {
    const ca = (tension.get(a) ?? 0) + (align.get(a) ?? 0);
    const cb = (tension.get(b) ?? 0) + (align.get(b) ?? 0);
    return cb - ca;
  });
  const id = inBoth[0];
  const t = targetMap.get(id);
  if (!t) return null;
  const label = `${getDocLabel(countryConfig ?? null, t.sourceDocument)}: ${t.sourceLabel}`;
  return {
    pattern: "paradox",
    vars: { label },
    callout: `${label} sits among both the most potentially misaligned and the most strongly aligned targets. Two sides of the same coin, worth a closer look.`,
    actions: [{ type: "select_target", targetId: id }],
    filter: "high_contra",
  };
}

/**
 * Tension cluster: at least three contradictions converge on a single target.
 * Suggests one driver behind a recurring tradeoff in the dataset.
 *
 * The `actions` focus the target's source-document arc (the dashboard
 * explorer's behaviour, kept as-is). `subjectTargetId` additionally carries
 * the target so the briefing's "Show me" can refocus that document and open
 * the target's flag-profile decomposition, the "N contradictions" payoff.
 */
function detectTensionCluster(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const count = new Map<string, number>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    count.set(a.targetAId, (count.get(a.targetAId) ?? 0) + 1);
    count.set(a.targetBId, (count.get(a.targetBId) ?? 0) + 1);
  }
  const top = topN([...count.entries()], 1);
  if (top.length === 0 || top[0][1] < 3) return null;
  const [id, n] = top[0];
  const t = targetMap.get(id);
  if (!t) return null;
  const label = `${getDocLabel(countryConfig ?? null, t.sourceDocument)}: ${t.sourceLabel}`;
  return {
    pattern: "tension_cluster",
    vars: { count: n, label },
    callout: `${n} potential misalignments converge on ${label}, more than on any other target in the dataset.`,
    pathway:
      "A boundary review on this target could help unlock alignment with the documents it is misaligned with.",
    actions: [
      { type: "set_mode", mode: "document" },
      { type: "focus_category", categoryId: t.sourceDocument },
    ],
    subjectTargetId: id,
    filter: "contradictions",
  };
}

/**
 * Zero-conflict topic: a taxonomy category whose primary-tagged targets
 * carry zero contradictions, while at least one peer category carries 3+.
 * Notable absence: a topic that isn't generating tradeoffs.
 */
function detectZeroConflictTopic(args: DetectArgs): Insight | null {
  const {
    targets,
    alignment,
    classifications,
    globeCategories,
    sectors,
    btrData,
  } = args;
  // Only taxonomies that have a wheel mode of their own. Adaptation goals are
  // a tag but not a grouping mode, so they would have nowhere to focus.
  void btrData;
  const taxes: Array<{
    type: "globe" | "sector";
    cats: { id: string; name: string }[];
    mode: ChatAction & { type: "set_mode" };
  }> = [
    {
      type: "globe",
      cats: globeCategories.map((c) => ({ id: c.id, name: c.name })),
      mode: { type: "set_mode", mode: "globe" },
    },
    {
      type: "sector",
      cats: sectors.map((c) => ({ id: c.id, name: c.name })),
      mode: { type: "set_mode", mode: "sector" },
    },
  ];
  const targetIds = new Set(targets.map((t) => t.id));
  const contradictionByTarget = new Map<string, number>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    contradictionByTarget.set(
      a.targetAId,
      (contradictionByTarget.get(a.targetAId) ?? 0) + 1,
    );
    contradictionByTarget.set(
      a.targetBId,
      (contradictionByTarget.get(a.targetBId) ?? 0) + 1,
    );
  }
  for (const tax of taxes) {
    const primaryByTarget = new Map<string, string>();
    for (const c of classifications) {
      if (!c.isPrimary) continue;
      if (c.taxonomyType !== tax.type) continue;
      if (!targetIds.has(c.targetId)) continue;
      primaryByTarget.set(c.targetId, c.categoryId);
    }
    const conflictsByCat = new Map<string, number>();
    const sizeByCat = new Map<string, number>();
    for (const [tId, catId] of primaryByTarget) {
      sizeByCat.set(catId, (sizeByCat.get(catId) ?? 0) + 1);
      conflictsByCat.set(
        catId,
        (conflictsByCat.get(catId) ?? 0) +
          (contradictionByTarget.get(tId) ?? 0),
      );
    }
    let peakConflict = 0;
    for (const v of conflictsByCat.values()) {
      if (v > peakConflict) peakConflict = v;
    }
    if (peakConflict < 3) continue;
    // Find a category that has 2+ targets (so the zero is meaningful) and zero
    // contradictions, while at least one peer has 3+.
    for (const cat of tax.cats) {
      const size = sizeByCat.get(cat.id) ?? 0;
      const conflicts = conflictsByCat.get(cat.id) ?? 0;
      if (size >= 2 && conflicts === 0) {
        return {
          pattern: "zero_conflict_topic",
          vars: { category: cat.name, size, peak: peakConflict },
          callout: `${cat.name} carries zero potential misalignments across ${size} targets, unusual when other topics carry ${peakConflict}+.`,
          actions: [tax.mode, { type: "focus_category", categoryId: cat.id }],
          filter: "all",
        };
      }
    }
  }
  return null;
}

/**
 * Hub: a target that participates in strong alignments with at least three
 * different documents. Quietly bridges multiple plans.
 */
function detectHub(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  // For each target, set of partner documents in "high" alignments.
  const docPartners = new Map<string, Set<string>>();
  for (const a of alignment) {
    if (a.alignment !== "high") continue;
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    if (tA.sourceDocument !== tB.sourceDocument) {
      const sA = docPartners.get(a.targetAId) ?? new Set<string>();
      sA.add(tB.sourceDocument);
      docPartners.set(a.targetAId, sA);
      const sB = docPartners.get(a.targetBId) ?? new Set<string>();
      sB.add(tA.sourceDocument);
      docPartners.set(a.targetBId, sB);
    }
  }
  const entries = [...docPartners.entries()].sort(
    (a, b) => b[1].size - a[1].size,
  );
  if (entries.length === 0 || entries[0][1].size < 3) return null;
  const [id, docs] = entries[0];
  const t = targetMap.get(id);
  if (!t) return null;
  const label = `${getDocLabel(countryConfig ?? null, t.sourceDocument)}: ${t.sourceLabel}`;
  return {
    pattern: "hub",
    vars: { label, docs: docs.size },
    callout: `${label} aligns strongly with ${docs.size} different documents, quietly bridging plans others touch separately.`,
    actions: [{ type: "select_target", targetId: id }],
    filter: "high",
  };
}

/**
 * Orphan: a target with the fewest non-none connections, at most one. Stands
 * apart from the rest of the network. Surfaces a coverage gap.
 */
function detectOrphan(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const connections = new Map<string, number>();
  for (const t of targets) connections.set(t.id, 0);
  for (const a of alignment) {
    if (a.alignment === "none") continue;
    connections.set(a.targetAId, (connections.get(a.targetAId) ?? 0) + 1);
    connections.set(a.targetBId, (connections.get(a.targetBId) ?? 0) + 1);
  }
  const sorted = [...connections.entries()].sort((a, b) => a[1] - b[1]);
  // Pick the lowest-count target. Require at least one peer with 4+ connections
  // so the contrast is meaningful (the dataset isn't uniformly sparse).
  if (sorted.length === 0) return null;
  const peakConnections = sorted[sorted.length - 1][1];
  if (peakConnections < 4) return null;
  const [id, count] = sorted[0];
  if (count > 1) return null;
  const t = targetMap.get(id);
  if (!t) return null;
  const label = `${getDocLabel(countryConfig ?? null, t.sourceDocument)}: ${t.sourceLabel}`;
  const phrase =
    count === 0
      ? "no alignments or tensions with any other target"
      : "only one connection across the whole dataset";
  return {
    pattern: "orphan",
    vars: { label, connections: count },
    callout: `${label} has ${phrase}, isolated from the rest of the network.`,
    actions: [{ type: "select_target", targetId: id }],
    filter: "all",
  };
}

/**
 * Cross-doc imbalance: a document pair where contradictions outnumber strong
 * alignments by at least 2-to-1, with enough overlap that the asymmetry is
 * meaningful. Highlights where two plans most disagree.
 */
function detectImbalance(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  interface Pair {
    contras: number;
    aligns: number;
  }
  const pairs = new Map<string, Pair>();
  const key = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`);
  for (const a of alignment) {
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    if (tA.sourceDocument === tB.sourceDocument) continue;
    const k = key(tA.sourceDocument, tB.sourceDocument);
    const slot = pairs.get(k) ?? { contras: 0, aligns: 0 };
    if (isContradiction(a.alignment)) slot.contras += 1;
    else if (a.alignment === "high") slot.aligns += 1;
    pairs.set(k, slot);
  }
  let best: { docs: [string, string]; pair: Pair } | null = null;
  for (const [k, slot] of pairs) {
    if (slot.contras < 4) continue;
    if (slot.contras < slot.aligns * 2) continue;
    if (!best || slot.contras > best.pair.contras) {
      const [a, b] = k.split("__");
      best = { docs: [a, b], pair: slot };
    }
  }
  if (!best) return null;
  const [dA, dB] = best.docs;
  const labelA = getDocLabel(countryConfig ?? null, dA as PolicyDocumentType);
  const labelB = getDocLabel(countryConfig ?? null, dB as PolicyDocumentType);
  return {
    pattern: "imbalance",
    vars: { labelA, labelB, contras: best.pair.contras, aligns: best.pair.aligns },
    callout: `${labelA} and ${labelB} carry ${best.pair.contras} potential misalignments versus ${best.pair.aligns} strong alignments, the most lopsided pair in the dataset.`,
    pathway:
      "A joint review across these two may help surface where their mandates diverge.",
    actions: [
      { type: "set_mode", mode: "document" },
      { type: "focus_category", categoryId: dA },
    ],
    filter: "contradictions",
  };
}

/**
 * Implementation contradiction: a tension between a BTR-sourced "reported
 * action" and a policy target. Qualitatively different from a plan-vs-plan
 * contradiction because one side is something the country is already doing
 * (Implemented / Ongoing / Adopted), not something it intends to do.
 *
 * Severity-aware: prefers likely_conflict over moderate over possible_misalignment.
 * Among same-severity matches, weights status to push Implemented/Ongoing
 * ahead of Adopted (closer to "happening now" carries more signal).
 */
function detectImplementationContradiction(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const SEVERITY: Record<string, number> = {
    likely_conflict: 0,
    possible_conflict: 1,
    possible_misalignment: 2,
  };
  const STATUS_WEIGHT: Record<string, number> = {
    Implemented: 0,
    Ongoing: 1,
    Adopted: 2,
    Planned: 3,
    NA: 4,
  };
  // Each candidate carries the BTR-side target + the policy-side target so
  // we don't redo the doc check at ranking time.
  interface Candidate {
    btr: Target;
    policy: Target;
    level: string;
    statusWeight: number;
    description: string;
  }
  const candidates: Candidate[] = [];
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    const aIsBtr = tA.sourceDocument === "BTR";
    const bIsBtr = tB.sourceDocument === "BTR";
    if (aIsBtr === bIsBtr) continue; // need exactly one BTR side
    const btr = aIsBtr ? tA : tB;
    const policy = aIsBtr ? tB : tA;
    const status = (btr as Target & PseudoExtras).measureStatus ?? "Reported";
    candidates.push({
      btr,
      policy,
      level: a.alignment,
      statusWeight: STATUS_WEIGHT[status] ?? 5,
      description: a.description ?? "",
    });
  }
  if (candidates.length === 0) return null;
  candidates.sort((x, y) => {
    const dS = (SEVERITY[x.level] ?? 99) - (SEVERITY[y.level] ?? 99);
    if (dS !== 0) return dS;
    return x.statusWeight - y.statusWeight;
  });
  const best = candidates[0];
  const status =
    (best.btr as Target & PseudoExtras).measureStatus ?? "Reported";
  const btrLabel = `${getDocLabel(countryConfig ?? null, best.btr.sourceDocument)} ${best.btr.sourceLabel}`;
  const policyLabel = `${getDocLabel(countryConfig ?? null, best.policy.sourceDocument)} ${best.policy.sourceLabel}`;
  const severityWord =
    best.level === "likely_conflict"
      ? "is likely to conflict with"
      : best.level === "possible_conflict"
        ? "may conflict with"
        : "may be misaligned with";
  return {
    pattern: "implementation_contradiction",
    vars: { btrLabel, status: status.toLowerCase(), severity: best.level, policyLabel },
    callout: `Reported action ${btrLabel} (${status.toLowerCase()}) ${severityWord} planned target ${policyLabel}. What is being done versus what was planned.`,
    pathway:
      "Reconciling the two, or flagging the pair for human review, could potentially close the gap between plan and practice.",
    actions: [
      {
        type: "select_pair",
        targetAId: best.btr.id,
        targetBId: best.policy.id,
      },
    ],
    filter: "contradictions",
  };
}

/**
 * Most contested topic: the taxonomy category whose primary-tagged targets
 * carry the highest total contradiction count. Surfaces the dataset's
 * biggest fault line by theme rather than by individual target.
 */
function detectMostContestedTopic(args: DetectArgs): Insight | null {
  const {
    targets,
    alignment,
    classifications,
    sectors,
    globeCategories,
  } = args;
  const targetIds = new Set(targets.map((t) => t.id));
  const contradictionsByTarget = new Map<string, number>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    contradictionsByTarget.set(
      a.targetAId,
      (contradictionsByTarget.get(a.targetAId) ?? 0) + 1,
    );
    contradictionsByTarget.set(
      a.targetBId,
      (contradictionsByTarget.get(a.targetBId) ?? 0) + 1,
    );
  }
  // Score each taxonomy category by total contradictions on its primary
  // members. GLOBE first (most visible on the wheel), sector second.
  const taxes: Array<{
    type: "globe" | "sector";
    cats: { id: string; name: string }[];
    mode: ChatAction & { type: "set_mode" };
  }> = [
    {
      type: "globe",
      cats: globeCategories.map((c) => ({ id: c.id, name: c.name })),
      mode: { type: "set_mode", mode: "globe" },
    },
    {
      type: "sector",
      cats: sectors.map((c) => ({ id: c.id, name: c.name })),
      mode: { type: "set_mode", mode: "sector" },
    },
  ];
  let best: {
    catId: string;
    catName: string;
    count: number;
    size: number;
    mode: ChatAction & { type: "set_mode" };
  } | null = null;
  for (const tax of taxes) {
    const primaryByTarget = new Map<string, string>();
    for (const c of classifications) {
      if (!c.isPrimary || c.taxonomyType !== tax.type) continue;
      if (!targetIds.has(c.targetId)) continue;
      primaryByTarget.set(c.targetId, c.categoryId);
    }
    const conflicts = new Map<string, number>();
    const size = new Map<string, number>();
    for (const [tId, catId] of primaryByTarget) {
      conflicts.set(
        catId,
        (conflicts.get(catId) ?? 0) + (contradictionsByTarget.get(tId) ?? 0),
      );
      size.set(catId, (size.get(catId) ?? 0) + 1);
    }
    for (const cat of tax.cats) {
      const count = conflicts.get(cat.id) ?? 0;
      const sz = size.get(cat.id) ?? 0;
      if (count < 4 || sz < 2) continue;
      if (!best || count > best.count) {
        best = {
          catId: cat.id,
          catName: cat.name,
          count,
          size: sz,
          mode: tax.mode,
        };
      }
    }
  }
  if (!best) return null;
  return {
    pattern: "most_contested_topic",
    vars: { category: best.catName, count: best.count, size: best.size },
    callout: `${best.catName} carries ${best.count} potential misalignments across ${best.size} targets, the heaviest concentration in the dataset.`,
    actions: [best.mode, { type: "focus_category", categoryId: best.catId }],
    filter: "contradictions",
  };
}

/**
 * Quantitative gap: the most-contested target lacks a measurable indicator.
 * Highlights where there's lots of disagreement but no number to anchor it.
 */
function detectQuantitativeGap(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const count = new Map<string, number>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    count.set(a.targetAId, (count.get(a.targetAId) ?? 0) + 1);
    count.set(a.targetBId, (count.get(a.targetBId) ?? 0) + 1);
  }
  // Walk top contradiction targets, take the first one without quantitative.
  const sorted = [...count.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id, n] of sorted) {
    if (n < 3) break;
    const t = targetMap.get(id);
    if (!t) continue;
    if (t.isQuantitative) continue;
    const label = `${getDocLabel(countryConfig ?? null, t.sourceDocument)} ${t.sourceLabel}`;
    return {
      pattern: "quantitative_gap",
      vars: { label, count: n },
      callout: `${label} sits in ${n} potential misalignments but carries no measurable indicator.`,
      pathway:
        "Without a number to anchor the target, several of these may rest on interpretation rather than policy conflict, worth a closer look before treating them as decision-grade signals.",
      actions: [{ type: "select_target", targetId: id }],
      filter: "contradictions",
    };
  }
  return null;
}

/**
 * Agreement pair: a document pair where strong alignments outnumber any
 * contradictions by a wide margin. The good-news counterpoint to imbalance.
 */
function detectAgreementPair(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  interface Pair {
    contras: number;
    aligns: number;
  }
  const pairs = new Map<string, Pair>();
  const key = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`);
  for (const a of alignment) {
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    if (tA.sourceDocument === tB.sourceDocument) continue;
    const k = key(tA.sourceDocument, tB.sourceDocument);
    const slot = pairs.get(k) ?? { contras: 0, aligns: 0 };
    if (isContradiction(a.alignment)) slot.contras += 1;
    else if (a.alignment === "high") slot.aligns += 1;
    pairs.set(k, slot);
  }
  let best: { docs: [string, string]; pair: Pair } | null = null;
  for (const [k, slot] of pairs) {
    if (slot.aligns < 6) continue;
    if (slot.aligns < slot.contras * 3) continue;
    if (!best || slot.aligns > best.pair.aligns) {
      const [a, b] = k.split("__");
      best = { docs: [a, b], pair: slot };
    }
  }
  if (!best) return null;
  const [dA, dB] = best.docs;
  const labelA = getDocLabel(countryConfig ?? null, dA as PolicyDocumentType);
  const labelB = getDocLabel(countryConfig ?? null, dB as PolicyDocumentType);
  const contraPhrase =
    best.pair.contras === 0
      ? "zero potential misalignments"
      : `only ${best.pair.contras} potential misalignments`;
  return {
    pattern: "agreement_pair",
    vars: { labelA, labelB, aligns: best.pair.aligns, contras: best.pair.contras },
    callout: `${labelA} and ${labelB} share ${best.pair.aligns} strong alignments and ${contraPhrase}, the most cohesive pair in the dataset.`,
    actions: [
      { type: "set_mode", mode: "document" },
      { type: "focus_category", categoryId: dA },
    ],
    filter: "high",
  };
}

/**
 * Most-aligned target: the positive-side counterpart to tension_cluster.
 * The single target that anchors the most high alignments (≥3), framed as
 * "the connector". Target view because the story is the specific target,
 * not its category.
 */
function detectMostAlignedTarget(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const count = new Map<string, number>();
  for (const a of alignment) {
    if (a.alignment !== "high") continue;
    count.set(a.targetAId, (count.get(a.targetAId) ?? 0) + 1);
    count.set(a.targetBId, (count.get(a.targetBId) ?? 0) + 1);
  }
  const top = topN([...count.entries()], 1);
  if (top.length === 0 || top[0][1] < 3) return null;
  const [id, n] = top[0];
  const t = targetMap.get(id);
  if (!t) return null;
  const label = `${getDocLabel(countryConfig ?? null, t.sourceDocument)}: ${t.sourceLabel}`;
  return {
    pattern: "most_aligned_target",
    vars: { label, count: n },
    callout: `${label} anchors ${n} strong alignments, the single biggest connector in the dataset.`,
    actions: [{ type: "select_target", targetId: id }],
    filter: "high",
  };
}

/**
 * Document with the most tensions: the source document whose targets carry
 * the highest total contradiction count across the wheel. Each contradiction
 * touches at most two documents; same-doc internal tensions count once.
 */
function detectDocWithMostTensions(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const count = new Map<string, number>();
  for (const a of alignment) {
    if (!isContradiction(a.alignment)) continue;
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    if (!tA || !tB) continue;
    count.set(tA.sourceDocument, (count.get(tA.sourceDocument) ?? 0) + 1);
    if (tB.sourceDocument !== tA.sourceDocument) {
      count.set(tB.sourceDocument, (count.get(tB.sourceDocument) ?? 0) + 1);
    }
  }
  const top = topN([...count.entries()], 1);
  // Require ≥5 tensions before flagging the doc, otherwise the "heaviest"
  // framing reads as alarmist when the second-place doc is at 2 or 3.
  if (top.length === 0 || top[0][1] < 5) return null;
  const [doc, n] = top[0];
  const docLabel = getDocLabel(
    countryConfig ?? null,
    doc as PolicyDocumentType,
  );
  return {
    pattern: "doc_most_tensions",
    vars: { docLabel, count: n },
    callout: `${docLabel} carries ${n} potential misalignments, the heaviest concentration in any single document.`,
    actions: [
      { type: "set_mode", mode: "document" },
      { type: "focus_category", categoryId: doc },
    ],
    filter: "contradictions",
  };
}

/**
 * BTR status mix: counts BTR pseudo-targets by `measureStatus` and surfaces
 * the Implemented + Ongoing share, the "what's already happening" signal.
 * Requires ≥2 distinct statuses with non-zero counts to be interesting
 * (otherwise it reads as a trivial single-bucket tally).
 */
function detectBtrStatusMix(args: DetectArgs): Insight | null {
  const { targets, btrData } = args;
  if (!btrData) return null;
  const btrTargets = targets.filter((t) => t.sourceDocument === "BTR");
  if (btrTargets.length === 0) return null;
  const byStatus = new Map<string, number>();
  for (const t of btrTargets) {
    const status =
      (t as Target & PseudoExtras).measureStatus ?? "Reported";
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  }
  // Need a mix of at least two statuses, otherwise the breakdown is uninteresting.
  if (byStatus.size < 2) return null;
  const total = btrTargets.length;
  const impl = byStatus.get("Implemented") ?? 0;
  const ong = byStatus.get("Ongoing") ?? 0;
  const adopt = byStatus.get("Adopted") ?? 0;
  const plan = byStatus.get("Planned") ?? 0;
  const happening = impl + ong;
  return {
    pattern: "btr_status_mix",
    vars: { happening, total, adopt, plan },
    callout: `${happening} of ${total} reported actions are already Implemented or Ongoing, ${adopt} Adopted and ${plan} Planned. The Implemented and Ongoing share is the strongest signal of what is already happening on the ground.`,
    actions: [
      { type: "set_mode", mode: "document" },
      { type: "focus_category", categoryId: "BTR" },
    ],
    filter: "all",
  };
}

/**
 * Quantitative coverage: dataset-wide callout on how many targets carry a
 * measurable indicator. Informational, no specific view to focus on, just
 * shifts to default document mode so the user can scan the corpus with the
 * number in mind. Only fires when < 50% of targets are quantitative and the
 * sample is large enough (≥20 targets) to be representative.
 */
function detectQuantitativeCoverage(args: DetectArgs): Insight | null {
  const { targets } = args;
  if (targets.length < 20) return null;
  const total = targets.length;
  const quant = targets.filter((t) => t.isQuantitative === true).length;
  if (quant / total >= 0.5) return null;
  return {
    pattern: "quantitative_coverage",
    vars: { quant, total },
    callout: `Only ${quant} of ${total} targets carry a measurable indicator. The rest read as direction-of-travel statements, hard to track without a number to anchor them.`,
    pathway:
      "Many of the alignment and potential-misalignment counts here may carry more interpretive weight than substantive policy conflict, given how many targets are direction-of-travel statements.",
    actions: [{ type: "set_mode", mode: "document" }],
    filter: "all",
  };
}

/**
 * Anchor support gap: of all anchor targets (the long-term-vision document's
 * targets, e.g. Mongolia's Vision 2050 pillars), surface the one with the
 * fewest strong supporting alignments from other plans. Picks up the TAG/Lea
 * ask to frame coherence around the national plan.
 *
 * TODO(anchor-config): the "anchor doc" is currently set per-country via
 * `countryConfig.anchorDocType`. A future iteration may let users pick an
 * anchor at runtime, or anchor against multiple docs at once, in which
 * case this detector will need to broaden its input. Keep the logic close
 * to `aggregateAnchorCoverage` so a config change here propagates cleanly.
 */
function detectAnchorSupportGap(args: DetectArgs): Insight | null {
  const { targets, alignment, countryConfig } = args;
  const anchorDocType = countryConfig?.anchorDocType;
  if (!anchorDocType) return null;

  const { rows } = aggregateAnchorCoverage(targets, alignment, anchorDocType);
  // Need at least three anchor targets to call something the "least
  // supported pillar" meaningfully; one or two pillars can't be ranked.
  if (rows.length < 3) return null;

  const sorted = [...rows].sort(
    (a, b) =>
      a.mediumOrHighCount - b.mediumOrHighCount ||
      a.distinctDocsWithMediumPlus - b.distinctDocsWithMediumPlus,
  );
  const worst = sorted[0];
  // Only flag when the worst case is genuinely sparse (0-2 strong
  // alignments). If every pillar is well-covered, no "gap" to surface.
  if (worst.mediumOrHighCount > 2) return null;

  const docLabel = getDocLabel(
    countryConfig ?? null,
    anchorDocType as PolicyDocumentType,
  );
  const pillarLabel = `${docLabel}: ${worst.anchor.sourceLabel}`;
  const n = worst.mediumOrHighCount;
  const supporters =
    n === 0
      ? "no strong supporting alignments from other plans"
      : n === 1
        ? "only 1 strong alignment from other plans"
        : `only ${n} strong alignments from other plans`;
  return {
    pattern: "anchor_support_gap",
    vars: { pillarLabel, count: n },
    callout: `${pillarLabel} has ${supporters}, the least-supported pillar in this dataset.`,
    pathway:
      "Reviewing whether existing targets in other plans could be mapped to this pillar may surface under-claimed alignment with the national plan.",
    actions: [{ type: "select_target", targetId: worst.anchor.id }],
    filter: "all",
  };
}

/**
 * Sector coverage gap: a policy/IPCC sector that carries policy targets but
 * has no reported actions in BTR. Surfaces the largest plan-vs-practice
 * divergence at sector scale. Adaptation actions classify to a separate
 * taxonomy (adaptation_goal) and won't appear here, so the signal is
 * mitigation-shaped by design.
 */
function detectSectorCoverageGap(args: DetectArgs): Insight | null {
  const { targets, classifications, sectors, btrData } = args;
  if (!btrData) return null;
  if (sectors.length === 0) return null;

  const targetById = new Map(targets.map((t) => [t.id, t]));
  const policyCount = new Map<string, number>();
  const btrCount = new Map<string, number>();
  for (const c of classifications) {
    if (c.taxonomyType !== "sector" || !c.isPrimary) continue;
    const t = targetById.get(c.targetId);
    if (!t) continue;
    // The "BTR" literal is the repo-wide identifier for reported-action
    // pseudo-targets (matches `target-atlas.tsx`, `data-sources-overview.tsx`,
    // and `policy-coherence-explorer.tsx`). Adaptation actions also carry
    // sourceDocument "BTR" but classify to adaptation_goal, not sector, so
    // they are filtered out by the taxonomyType check above.
    if (t.sourceDocument === "BTR") {
      btrCount.set(c.categoryId, (btrCount.get(c.categoryId) ?? 0) + 1);
    } else {
      policyCount.set(c.categoryId, (policyCount.get(c.categoryId) ?? 0) + 1);
    }
  }
  let best: { id: string; name: string; policy: number } | null = null;
  for (const s of sectors) {
    const p = policyCount.get(s.id) ?? 0;
    const b = btrCount.get(s.id) ?? 0;
    if (p < 2) continue;
    if (b !== 0) continue;
    if (!best || p > best.policy) best = { id: s.id, name: s.name, policy: p };
  }
  if (!best) return null;
  return {
    pattern: "sector_coverage_gap",
    vars: { sector: best.name, count: best.policy },
    callout: `Sector "${best.name}" carries ${best.policy} policy targets but no reported actions in BTR, the largest plan-vs-practice gap by sector in this dataset.`,
    pathway:
      "Cross-checking whether the gap reflects missing implementation or missing transparency reporting may help close the loop.",
    actions: [
      { type: "set_mode", mode: "sector" },
      { type: "focus_category", categoryId: best.id },
    ],
    filter: "all",
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function topN<K>(entries: [K, number][], n: number): [K, number][] {
  return entries
    .slice()
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
