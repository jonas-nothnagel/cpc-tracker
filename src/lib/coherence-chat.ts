/**
 * Pure helpers for the Coherence Explorer chat. The component builds its
 * request payload by calling `buildChatRequest` and then dispatches the
 * returned actions through its own state setters — keeping all the data-
 * shaping logic out of the React render tree makes the wheel component
 * smaller and the scope contract easier to read in one place.
 */

import { isContradiction } from "@/types";
import { getDocLabel } from "@/lib/utils";
import type {
  AlignmentLevel,
  AlignmentResult,
  BtrData,
  CountryConfig,
  PolicyDocumentType,
  Target,
  ThematicClassification,
} from "@/types";

export type ChatScope = "current_view" | "all_documents";

export type ChatAction =
  | { type: "set_filter"; filter: string }
  | { type: "focus_category"; categoryId: string }
  | { type: "select_target"; targetId: string }
  | { type: "select_pair"; targetAId: string; targetBId: string }
  | { type: "set_mode"; mode: "document" | "sector" | "globe" }
  /** Unhide one or more documents so the next action's target is visible.
   *  Emitted by the server when the user names a hidden doc under the
   *  strict default scope (auto-broaden). */
  | { type: "show_docs"; ids: string[] };

/** A chip rendered after the reply that, on click, asks a follow-up. */
export interface ChatSuggestion {
  label: string;
  /** Free-text query to submit to the chat. */
  query: string;
  /**
   * Optional client-side handler hint. When set to "surprise" the chip
   * triggers the local insight detector instead of POSTing — keeps the
   * Surprise-me chip instant and free of LLM cost.
   */
  kind?: "surprise" | "broaden";
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

export interface ChatRankings {
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
}

/**
 * Build the request body sent to `/api/coherence-chat`. The chat sees the
 * full corpus on every turn; the visibleDocs list is sent as context so the
 * model can emit show_docs(...) when it needs to navigate to a doc the user
 * has toggled off. Scoping by current view forced users to manage their
 * filter state before asking, which defeated the point of a chat helper.
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
}: BuildChatRequestArgs) {
  const targetMap = new Map(targets.map((t) => [t.id, t]));

  const rankings = computeRankings(alignment, targetMap, countryConfig);

  const visibleDocs = availableDocs.filter((d) => !hiddenDocs.has(d));
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

  // Full target list. Text capped at 350 chars: enough for the model to
  // identify topic and quote a short phrase. Combined with the rationale
  // cap (200 chars), this keeps a single chat call comfortably under typical
  // Azure TPM quotas even at a few hundred targets.
  const targetIndex = targets.map((t) => {
    const primary = primaryByTarget.get(t.id);
    return {
      id: t.id,
      sourceLabel: t.sourceLabel,
      sourceDocument: t.sourceDocument,
      text: (t.text ?? "").slice(0, 350),
      actionType: t.actionType,
      isQuantitative: t.isQuantitative,
      isTimeBound: t.isTimeBound,
      primaryGlobe: primary?.globe,
      primarySector: primary?.sector,
      primaryAdaptationGoal: primary?.adaptation,
    };
  });

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

  // Pair rationales: only diagnostic pairs (contradictions + strong
  // alignments). Medium/low alignments aren't what the chat is asked about
  // and would balloon the prompt — the user can still see every pair via
  // the wheel. Rationale text capped at 200 chars to keep payload bounded.
  const pairs = alignment
    .filter((a) => isDiagnostic(a.alignment))
    .map((a) => ({
      a: a.targetAId,
      b: a.targetBId,
      level: a.alignment,
      contradictionType: a.contradictionType,
      rationale: (a.description ?? "").slice(0, 200),
    }));

  return {
    query,
    context: {
      mode: groupMode,
      filter,
      scope: "all_documents" as ChatScope,
      groups,
      visibleDocs,
      targetIndex,
      taxonomies,
      pairs,
      rankings,
      country: targets[0]?.country ?? null,
    },
    ...(history && history.length ? { history } : {}),
  };
}

function isDiagnostic(level: AlignmentLevel): boolean {
  return (
    level === "high_contradiction" ||
    level === "moderate_contradiction" ||
    level === "low_tension" ||
    level === "high"
  );
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
  visibleDocs: PolicyDocumentType[];
  globeCategoriesAvailable: boolean;
  sectorsAvailable: boolean;
  hasFood: boolean;
  hasBiodiversity: boolean;
  hasClimate: boolean;
  hasAdaptation: boolean;
  hasTensions: boolean;
  /** Whether the dataset includes BTR reported actions. Unlocks "what's
   *  happening vs what's planned" questions, the sharpest signal in a
   *  coherence assessment. */
  hasBtr: boolean;
  /** Country name (eg "Mongolia", "Panama") used to surface country-specific
   *  chips when the dataset shape supports them. */
  country?: string | null;
}

/**
 * Pick 4-5 example chip questions tailored to the visible dataset. Chips
 * read like questions a policymaker would ask, not routing test cases. All
 * use commas / periods, never em dashes (a project guardrail: em dashes
 * read as machine-generated).
 *
 * Each chip in the candidate library is gated by a precondition. When a
 * dataset can't answer a chip honestly (eg no food-security doc loaded),
 * the chip is dropped silently rather than swapped for a less specific
 * variant. Order is priority: BTR / implementation framing first when
 * available, since that's the sharpest signal in a coherence dataset.
 */
export function pickExampleQueries(args: PickExampleQueriesArgs): string[] {
  const {
    hasFood,
    hasBiodiversity,
    hasClimate,
    hasAdaptation,
    hasTensions,
    hasBtr,
    country,
    globeCategoriesAvailable,
    sectorsAvailable,
    visibleDocs,
  } = args;
  const isMongolia = (country ?? "").toLowerCase() === "mongolia";
  const isPanama = (country ?? "").toLowerCase() === "panama";
  const candidates: Array<{ when: boolean; q: string }> = [
    // BTR-versus-policy framing comes first — it's the most actionable
    // pattern in a coherence dataset because BTR pairs reflect what the
    // country is ALREADY doing, not just what it plans.
    {
      when: hasBtr && hasTensions,
      q: "Where do reported actions contradict policy targets?",
    },
    {
      when: hasBtr && hasFood && isMongolia,
      q: "Does Mongolia's food security plan clash with reported actions?",
    },
    {
      when: hasBtr,
      q: "Find the sharpest conflict between an action and a plan",
    },
    // Country-flavoured chips when the dataset shape supports them.
    {
      when: hasFood && hasBiodiversity,
      q: "Where does food security pull against biodiversity?",
    },
    {
      when: hasClimate && hasBiodiversity && hasTensions,
      q: "Where do climate plans contradict biodiversity plans?",
    },
    {
      when: isPanama && hasTensions,
      q: "Which Panama target is contested across the most documents?",
    },
    // Generic always-applicable chips.
    {
      when: hasTensions,
      q: "Show me the most contested target across all plans",
    },
    {
      when: hasTensions,
      q: "Find a paradox: a target that's highly aligned and highly contested",
    },
    {
      when: visibleDocs.length >= 2,
      q: "Which target barely connects to anything else?",
    },
    {
      when: globeCategoriesAvailable || sectorsAvailable,
      q: "Which topic has surprisingly few conflicts?",
    },
    {
      when: hasAdaptation,
      q: "How well do adaptation actions line up with national targets?",
    },
  ];
  return candidates
    .filter((c) => c.when)
    .map((c) => c.q)
    .slice(0, 5);
}
