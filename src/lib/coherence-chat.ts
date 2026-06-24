/**
 * Pure helpers for the Coherence Explorer chat. The component builds its
 * request payload by calling `buildChatRequest` and then dispatches the
 * returned actions through its own state setters — keeping all the data-
 * shaping logic out of the React render tree makes the wheel component
 * smaller and the scope contract easier to read in one place.
 */

import { isContradiction } from "@/types";
import { getDocLabel } from "@/lib/utils";
import {
  buildTopicRankings,
  detectQueryScope,
  selectChatContext,
} from "@/lib/chat-context-selection";
import type { CategoryBudgetSummary } from "@/lib/coherence-budget";
import type {
  AlignmentResult,
  BtrData,
  CorpusThemes,
  CountryConfig,
  DocPairSynthesis,
  PolicyDocumentType,
  SectorSynthesis,
  Target,
  ThematicClassification,
} from "@/types";

export type ChatAction =
  | { type: "set_filter"; filter: string }
  | { type: "focus_category"; categoryId: string }
  | { type: "select_target"; targetId: string }
  | { type: "select_pair"; targetAId: string; targetBId: string }
  | { type: "set_mode"; mode: "document" | "sector" | "globe" }
  /** Unhide one or more documents so the next action's target is visible.
   *  Emitted by the server when the answer touches a doc that isn't in the
   *  current visible-groups set. Applied client-side before any focus or
   *  selection action so the reveal happens first. */
  | { type: "show_docs"; ids: string[] };

/** A chip rendered after the reply that, on click, asks a follow-up. */
export interface ChatSuggestion {
  label: string;
  /** Free-text query to submit to the chat. */
  query: string;
  /**
   * Optional client-side handler hint. When set to "surprise" the chip
   * rotates to the next local insight instead of POSTing — keeps the
   * Surprise-me chip instant and free of LLM cost.
   */
  kind?: "surprise";
}

/** One previous turn kept for short-term memory (~last 3 turns). */
export interface ChatHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTaxCategory {
  id: string;
  name: string;
  description: string;
}

export interface RankedItem {
  id: string;
  label: string;
  count: number;
}

interface ChatRankings {
  topGroupsByTension: RankedItem[];
  topGroupsByAlignment: RankedItem[];
  topTargetsByTension: RankedItem[];
  topTargetsByAlignment: RankedItem[];
}

interface BuildChatRequestArgs {
  query: string;
  groupMode: "document" | "sector" | "globe";
  filter: string;
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: ChatTaxCategory[];
  globeCategories: ChatTaxCategory[];
  btrData?: BtrData | null;
  availableDocs: PolicyDocumentType[];
  /** Docs the user currently has toggled off. Surfaced to the model as
   *  context so it can emit show_docs before navigating to a hidden one. */
  hiddenDocs: Set<string>;
  countryConfig?: CountryConfig | null;
  /** Last few turns of conversation for short-term memory. Optional. */
  history?: ChatHistoryTurn[];
  /** Per-primary-GLOBE budget summary, when the country has BER data. Always
   *  forwarded to the chat context (not gated by the overlay toggle) so a user
   *  can ask budget questions from any lens. Null when no budget data. */
  budgetSummary?: CategoryBudgetSummary | null;
  /** Precomputed synthesis artifacts from the pipeline (corpus-level
   *  storylines, per-doc-pair and per-sector summaries). When present, they
   *  let the chat answer big-picture questions ("main storyline", "how do
   *  these two documents relate") from the LLM-derived narrative rather than
   *  re-deriving it from raw pairs. All optional; absent on older runs. */
  corpusThemes?: CorpusThemes | null;
  docPairSyntheses?: DocPairSynthesis[];
  sectorSyntheses?: SectorSynthesis[];
}

/**
 * Build the request body sent to `/api/coherence-chat`. Reasons over the whole
 * visible corpus (we don't make users manage filter state before asking), but
 * the heavy parts (pair rationales, target text) are reduced to an
 * intent-aware, token-budgeted selection via selectChatContext so a turn stays
 * under the deployment's per-minute token quota. Aggregate questions are still
 * answered from the full-corpus rankings + synthesis, which are sent whole. The
 * visibleDocs list rides along so the model can emit show_docs(...) for a doc
 * the user has toggled off.
 */
export function buildChatRequest({
  query,
  groupMode,
  filter,
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  btrData,
  availableDocs,
  hiddenDocs,
  countryConfig,
  history,
  budgetSummary,
  corpusThemes,
  docPairSyntheses,
  sectorSyntheses,
}: BuildChatRequestArgs) {
  const visibleDocs = availableDocs.filter((d) => !hiddenDocs.has(d));
  const visibleDocSet = new Set(visibleDocs);

  // Adaptive payload scoping: when the user toggles documents OFF on the
  // wheel, drop their targets and pairs from the chat context. The chat
  // answers over what the user can see, not the full corpus. Reduces
  // payload proportionally on large datasets (Panama can drop several
  // thousand high-alignment pairs when half the docs are hidden) and
  // honours the user's intent to focus.
  const visibleTargets = targets.filter((t) =>
    visibleDocSet.has(t.sourceDocument),
  );
  const visibleTargetIds = new Set(visibleTargets.map((t) => t.id));
  const visibleAlignment = alignment.filter(
    (a) =>
      visibleTargetIds.has(a.targetAId) && visibleTargetIds.has(a.targetBId),
  );

  const targetMap = new Map(visibleTargets.map((t) => [t.id, t]));
  const rankings = computeRankings(visibleAlignment, targetMap, countryConfig);

  // Document-type registry from the country config so the chat can render
  // full names alongside short ids. Falls back to the short id where the
  // config doesn't carry a fullLabel.
  const documentTypes = availableDocs.map((d) => {
    const cfg = countryConfig?.documentTypes?.find((dt) => dt.id === d);
    return {
      id: d,
      fullLabel: cfg?.fullLabel ?? cfg?.mediumLabel ?? d,
    };
  });
  const groups = availableDocs.map((d) => ({
    id: d,
    label: getDocLabel(countryConfig ?? null, d),
  }));

  // Per-target primary classification per taxonomy. Lets chat answer
  // thematic questions like "most contested target on pollution" by
  // matching the topic to a GLOBE/IPCC/adaptation_goal category instead of
  // fuzzy-matching the target text.
  const primaryByTarget = buildPrimaryByTarget(
    classifications,
    sectors,
    globeCategories,
    btrData,
  );

  const taxonomies = {
    globe: globeCategories.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    })),
    sector: sectors.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
    })),
    adaptation: (btrData?.adaptationGoals ?? []).map((g) => ({
      id: g.id,
      description: g.description,
    })),
  };

  // Intent-aware, token-budgeted context selection. The chat used to ship
  // every diagnostic pair on every turn, which overflowed the model's
  // per-minute token quota (deterministic 429s) and buried the relevant
  // evidence under thousands of pairs. We now detect the question's scope,
  // pick the most relevant pairs within a token budget, and report what was
  // used via contextMeta. See chat-context-selection.ts for the algorithm.
  const scope = detectQueryScope(query, {
    documentTypes,
    targets: visibleTargets,
    taxonomies,
  });
  const guaranteedTargetIds = new Set<string>([
    ...rankings.topTargetsByTension.map((r) => r.id),
    ...rankings.topTargetsByAlignment.map((r) => r.id),
  ]);
  const selection = selectChatContext({
    query,
    scope,
    visibleTargets,
    visibleAlignment,
    primaryByTarget,
    guaranteedTargetIds,
  });
  const pairs = selection.pairs;

  // Topic-scoped rankings, computed over the FULL alignment set (never the
  // budgeted pair subset) so any counts the model quotes stay accurate even
  // when the evidence pairs are capped. Replaces the route's own recompute.
  const topicRankings =
    scope.topic &&
    buildTopicRankings(scope.topic, visibleTargets, visibleAlignment, primaryByTarget);
  const topicResolution =
    scope.topic && topicRankings
      ? {
          taxonomy: scope.topic.taxonomy,
          categoryId: scope.topic.categoryId,
          categoryLabel: scope.topic.categoryLabel,
          byTension: topicRankings.byTension,
          byAlignment: topicRankings.byAlignment,
        }
      : undefined;

  // Full target list. Full text is attached only to the targets the selector
  // kept in scope (those in selected pairs + top-ranked); every target still
  // appears in the index with id, label, doc, and tags so id resolution,
  // inline chips, and navigation keep working without shipping every text.
  const targetIndex = visibleTargets.map((t) => {
    const primary = primaryByTarget.get(t.id);
    return {
      id: t.id,
      sourceLabel: t.sourceLabel,
      sourceDocument: t.sourceDocument,
      text: selection.fullTextTargetIds.has(t.id) ? t.text ?? "" : "",
      actionType: t.actionType,
      isQuantitative: t.isQuantitative,
      isTimeBound: t.isTimeBound,
      primaryGlobe: primary?.globe,
      primarySector: primary?.sector,
      primaryAdaptationGoal: primary?.adaptation,
    };
  });

  // Budget-by-category block: serialized as a compact array of (categoryId,
  // name, total in unit, share, target count, target share, contradiction
  // pair count). Always sent when budget data exists, regardless of which
  // lens the user is on — the chat is a corpus-wide Q&A, the overlay toggle
  // only controls the wheel's paint.
  const budgetByCategory = budgetSummary
    ? budgetSummary.entries.map((e) => ({
        categoryId: e.categoryId,
        categoryName: e.categoryName,
        totalBudget: e.totalBudget,
        shareOfTotalBudget: e.shareOfTotalBudget,
        targetCount: e.targetCount,
        shareOfTargets: e.shareOfTargets,
        contradictionPairCount: e.contradictionPairCount,
      }))
    : undefined;
  const budgetMeta = budgetSummary
    ? {
        currency: budgetSummary.currency,
        unit: budgetSummary.unit,
        period: budgetSummary.period,
        totalBudget: budgetSummary.totalBudget,
      }
    : undefined;

  const synthesis = buildSynthesisContext({
    corpusThemes,
    docPairSyntheses,
    sectorSyntheses,
  });

  return {
    query,
    context: {
      mode: groupMode,
      filter,
      groups,
      visibleDocs,
      documentTypes,
      targetIndex,
      taxonomies,
      pairs,
      rankings,
      contextMeta: selection.meta,
      country: targets[0]?.country ?? null,
      ...(topicResolution ? { topicResolution } : {}),
      ...(budgetByCategory ? { budgetByCategory, budgetMeta } : {}),
      ...(synthesis ? { synthesis } : {}),
    },
    ...(history && history.length ? { history } : {}),
  };
}

/** Cap on sector syntheses sent to the chat. Bounds the payload on large
 *  corpora (Panama has ~26); we send the highest-signal sectors first so the
 *  most-discussed themes are always present. Data-derived: ranked by total
 *  signal (aligned + flagged), not an arbitrary alphabetical slice. */
const SECTOR_SYNTHESIS_CAP = 15;

/**
 * Shape the precomputed synthesis artifacts into a compact context block.
 * Drops entries that errored during synthesis, keeps only the human-readable
 * narrative fields (no counts, the model gets those from rankings/pairs), and
 * caps sector syntheses to the highest-signal `SECTOR_SYNTHESIS_CAP`. Returns
 * undefined when there is nothing worth sending so the caller can omit the key.
 */
function buildSynthesisContext({
  corpusThemes,
  docPairSyntheses,
  sectorSyntheses,
}: {
  corpusThemes?: CorpusThemes | null;
  docPairSyntheses?: DocPairSynthesis[];
  sectorSyntheses?: SectorSynthesis[];
}) {
  const corpus =
    corpusThemes &&
    (corpusThemes.summary_paragraph || corpusThemes.storylines.length)
      ? {
          summary: corpusThemes.summary_paragraph,
          storylines: corpusThemes.storylines.map((s) => ({
            name: s.name,
            type: s.type,
            description: s.description,
          })),
        }
      : undefined;

  const docPairs = (docPairSyntheses ?? [])
    .filter((d) => !d.synthesis_error && d.synthesis)
    .map((d) => ({
      a: d.label_a,
      b: d.label_b,
      storyline: d.synthesis.storyline_name,
      reinforce: d.synthesis.reinforce,
      clash: d.synthesis.clash,
      coordination: d.synthesis.coordination_hint,
    }));

  const sectors = (sectorSyntheses ?? [])
    .filter((s) => !s.synthesis_error && s.synthesis)
    .slice()
    .sort(
      (a, b) =>
        b.aligned_count +
        b.flagged_count -
        (a.aligned_count + a.flagged_count),
    )
    .slice(0, SECTOR_SYNTHESIS_CAP)
    .map((s) => ({
      category: s.category_name,
      reinforce: s.synthesis.reinforce,
      clash: s.synthesis.clash,
      coordination: s.synthesis.coordination_hint,
    }));

  if (!corpus && docPairs.length === 0 && sectors.length === 0) {
    return undefined;
  }
  return { corpus, docPairs, sectors };
}

function computeRankings(
  alignSet: AlignmentResult[],
  targetMap: Map<string, Target>,
  countryConfig: CountryConfig | null | undefined,
): ChatRankings {
  const groupT = new Map<string, number>();
  const groupH = new Map<string, number>();
  const targetT = new Map<string, number>();
  const targetH = new Map<string, number>();
  for (const a of alignSet) {
    const tA = targetMap.get(a.targetAId);
    const tB = targetMap.get(a.targetBId);
    const gA = tA?.sourceDocument;
    const gB = tB?.sourceDocument;
    if (isContradiction(a.alignment)) {
      targetT.set(a.targetAId, (targetT.get(a.targetAId) ?? 0) + 1);
      targetT.set(a.targetBId, (targetT.get(a.targetBId) ?? 0) + 1);
      if (gA) groupT.set(gA, (groupT.get(gA) ?? 0) + 1);
      if (gB && gB !== gA) groupT.set(gB, (groupT.get(gB) ?? 0) + 1);
    } else if (a.alignment === "high") {
      targetH.set(a.targetAId, (targetH.get(a.targetAId) ?? 0) + 1);
      targetH.set(a.targetBId, (targetH.get(a.targetBId) ?? 0) + 1);
      if (gA) groupH.set(gA, (groupH.get(gA) ?? 0) + 1);
      if (gB && gB !== gA) groupH.set(gB, (groupH.get(gB) ?? 0) + 1);
    }
  }
  const rankBy = <K,>(
    m: Map<K, number>,
    format: (id: K, count: number) => RankedItem | null,
  ): RankedItem[] =>
    Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => format(id, count))
      .filter((x): x is RankedItem => x !== null);
  return {
    topGroupsByTension: rankBy(groupT, (id, count) => ({
      id,
      label: getDocLabel(countryConfig ?? null, id),
      count,
    })),
    topGroupsByAlignment: rankBy(groupH, (id, count) => ({
      id,
      label: getDocLabel(countryConfig ?? null, id),
      count,
    })),
    topTargetsByTension: rankBy(targetT, (id, count) => {
      const t = targetMap.get(id);
      return t
        ? { id, label: `${t.sourceDocument}: ${t.sourceLabel}`, count }
        : null;
    }),
    topTargetsByAlignment: rankBy(targetH, (id, count) => {
      const t = targetMap.get(id);
      return t
        ? { id, label: `${t.sourceDocument}: ${t.sourceLabel}`, count }
        : null;
    }),
  };
}

interface PrimarySlot {
  globe?: { id: string; name: string };
  sector?: { id: string; name: string };
  adaptation?: { id: string; description: string };
}

function buildPrimaryByTarget(
  classifications: ThematicClassification[],
  sectors: ChatTaxCategory[],
  globeCategories: ChatTaxCategory[],
  btrData: BtrData | null | undefined,
): Map<string, PrimarySlot> {
  const globeById = new Map(globeCategories.map((c) => [c.id, c.name]));
  const sectorById = new Map(sectors.map((c) => [c.id, c.name]));
  const adaptationById = new Map(
    (btrData?.adaptationGoals ?? []).map((g) => [g.id, g.description]),
  );
  const out = new Map<string, PrimarySlot>();
  for (const c of classifications) {
    if (!c.isPrimary) continue;
    const slot = out.get(c.targetId) ?? {};
    if (c.taxonomyType === "globe" && globeById.has(c.categoryId)) {
      slot.globe = { id: c.categoryId, name: globeById.get(c.categoryId)! };
    } else if (c.taxonomyType === "sector" && sectorById.has(c.categoryId)) {
      slot.sector = { id: c.categoryId, name: sectorById.get(c.categoryId)! };
    } else if (
      c.taxonomyType === "adaptation_goal" &&
      adaptationById.has(c.categoryId)
    ) {
      slot.adaptation = {
        id: c.categoryId,
        description: adaptationById.get(c.categoryId)!,
      };
    }
    out.set(c.targetId, slot);
  }
  return out;
}

// ─── Example chips ──────────────────────────────────────────────────

interface PickExampleQueriesArgs {
  globeCategoriesAvailable: boolean;
  sectorsAvailable: boolean;
  hasAdaptation: boolean;
  hasTensions: boolean;
  /** Whether the dataset includes BTR reported actions. Unlocks the
   *  "what's happening vs what's planned" framing, the sharpest signal
   *  in a coherence dataset. */
  hasBtr: boolean;
  /** Whether the dataset includes biodiversity expenditure data
   *  classified to GLOBE. Unlocks the "money vs tensions" framing. */
  hasBudget: boolean;
}

/**
 * Stable keys for the example chip questions, split into a coherence pool
 * and a finance pool. The explorer maps each key to a localized question
 * string (`explorer.questions.<pool>.<key>`) and surfaces up to three for the
 * active view, so the user-facing text lives in the i18n catalogue (en/es/mn)
 * rather than hard-coded English and stays governed by the display-vocabulary
 * guardrail ("potential misalignment", never "contradiction"/"tension").
 *
 * Each key is gated by a precondition. When a dataset can't answer a question
 * honestly, the key is dropped silently. Order within each pool is priority:
 * the highest-priority keys that match the dataset are the ones that surface.
 * The finance pool stays empty without tagged budget data, which is the same
 * signal the explorer uses to decide whether to offer the finance view at all.
 */
export interface ExampleQueryPools {
  coherence: string[];
  finance: string[];
}

export function pickExampleQueries(
  args: PickExampleQueriesArgs,
): ExampleQueryPools {
  const {
    hasAdaptation,
    hasTensions,
    hasBtr,
    hasBudget,
    globeCategoriesAvailable,
    sectorsAvailable,
  } = args;
  // Coherence pool. Implementation reality (BTR reported actions read against
  // planned targets) leads whenever BTR data is present: it is the sharpest
  // signal a coherence dataset can carry. The rest are pathway-shaped or
  // target-quality questions, each opening a different slice of the data.
  const coherence: Array<{ when: boolean; key: string }> = [
    { when: hasBtr && hasTensions, key: "reportedVsPlanned" },
    { when: hasTensions, key: "ministryCoordination" },
    { when: hasTensions, key: "tightenBoundary" },
    { when: hasTensions, key: "missingIndicator" },
    {
      when: globeCategoriesAvailable || sectorsAvailable,
      key: "themeConcentration",
    },
    { when: hasAdaptation, key: "adaptationAlignment" },
  ];
  // Finance pool. Only meaningful when the dataset carries tagged budget data
  // (BER classified to GLOBE); otherwise it stays empty.
  const finance: Array<{ when: boolean; key: string }> = [
    { when: hasBudget && hasTensions, key: "spendVsMisalignment" },
    { when: hasBudget, key: "underFunded" },
    { when: hasBudget && globeCategoriesAvailable, key: "fundedCategories" },
  ];
  return {
    coherence: coherence.filter((c) => c.when).map((c) => c.key),
    finance: finance.filter((c) => c.when).map((c) => c.key),
  };
}
