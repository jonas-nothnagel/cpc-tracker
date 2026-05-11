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
  | { type: "set_mode"; mode: "document" | "sector" | "globe" };

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
  /** false = strict (current view), true = override (full corpus). */
  searchAllDocs: boolean;
  groupMode: "document" | "sector" | "globe";
  filter: string;
  targets: Target[];
  alignment: AlignmentResult[];
  visibleAlignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: ChatTaxCategory[];
  globeCategories: ChatTaxCategory[];
  btrData?: BtrData | null;
  availableDocs: PolicyDocumentType[];
  hiddenDocs: Set<string>;
  /** Set of target ids inside the focal category, or null when none focused. */
  focalGroupTargetIds: Set<string> | null;
  countryConfig?: CountryConfig | null;
}

/**
 * Build the request body sent to `/api/coherence-chat`. Scope contract:
 *
 * - strict (`searchAllDocs === false`): groups, targets, pairs, and rankings
 *   are restricted to currently-visible docs (and the focal category's
 *   targets, when one is set). `rankingsFull` is omitted entirely.
 * - override (`searchAllDocs === true`): full corpus is included so the chat
 *   can answer cross-doc questions; the server may auto-unhide referenced
 *   docs on the client side.
 */
export function buildChatRequest({
  query,
  searchAllDocs,
  groupMode,
  filter,
  targets,
  alignment,
  visibleAlignment,
  classifications,
  sectors,
  globeCategories,
  btrData,
  availableDocs,
  hiddenDocs,
  focalGroupTargetIds,
  countryConfig,
}: BuildChatRequestArgs) {
  const strictMode = !searchAllDocs;
  const targetMap = new Map(targets.map((t) => [t.id, t]));

  const rankingsVisible = computeRankings(visibleAlignment, targetMap, countryConfig);
  // Full-scope rankings are only useful under the override; computing them
  // in strict mode would leak hidden-doc ids back to the model.
  const rankingsFull = strictMode
    ? null
    : computeRankings(alignment, targetMap, countryConfig);

  // Groups: in strict mode only currently-visible docs are sent (the model
  // is contractually unable to reference hidden ones). In override mode the
  // full doc list is sent so the model can navigate cross-doc.
  const visibleDocs = availableDocs.filter((d) => !hiddenDocs.has(d));
  const groups = (strictMode ? visibleDocs : availableDocs).map((d) => ({
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

  // Strict mode filters targets to current scope: visible docs only, and
  // restricted to the focal category's targets when one is selected.
  // Override mode sends the full target list so the chat can answer cross-
  // doc questions (auto-unhide makes the result visible).
  // Text capped at 350 chars: enough for the model to identify topic and
  // quote a short phrase. Combined with the rationale cap, this keeps a
  // single chat call comfortably under typical Azure TPM quotas.
  const scopeTargets = strictMode
    ? targets.filter((t) => {
        if (hiddenDocs.has(t.sourceDocument)) return false;
        if (focalGroupTargetIds && !focalGroupTargetIds.has(t.id)) return false;
        return true;
      })
    : targets;
  const scopeTargetIds = new Set(scopeTargets.map((t) => t.id));
  const targetIndex = scopeTargets.map((t) => {
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
  // Endpoint filter keeps the model from referencing out-of-scope targets.
  const pairs = alignment
    .filter(
      (a) =>
        isDiagnostic(a.alignment) &&
        scopeTargetIds.has(a.targetAId) &&
        scopeTargetIds.has(a.targetBId),
    )
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
      scope: (strictMode ? "current_view" : "all_documents") as ChatScope,
      groups,
      visibleDocs,
      targetIndex,
      taxonomies,
      pairs,
      rankings: rankingsVisible,
      ...(rankingsFull ? { rankingsFull } : {}),
      country: targets[0]?.country ?? null,
    },
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
