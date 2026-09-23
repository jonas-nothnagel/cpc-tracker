import {
  alignedTargets,
  areaRows,
  commitmentsToReview,
  docStats,
  concentrationOf,
  docPairStats,
  leadingPair,
  pairExample,
  themeExample,
  themeRows,
  toneOf,
  overallLead,
  toneCounts,
  type AlignedRow,
  type AreaRow,
  type CommitmentRow,
  type DocStat,
  type Concentration,
  type DocPairStat,
  type ExamplePair,
  type Scope,
  type ThemeRow,
  type OverallLead,
  type ToneCounts,
} from "./compute";
import { getDocPairKey, getStorylineDocPairKeys } from "@/lib/coherence-briefing";
import type { BriefSource, LensId } from "./source";

/** A recurring theme with its own example, so the example a reader sees
 *  always belongs to the theme they selected. */
export interface ThemeItem extends ThemeRow {
  example: ExamplePair | null;
}

export interface ThemeSection {
  rows: ThemeItem[];
  /** Theme names were written for exactly this selection of documents. */
  exact: boolean;
  /** The first theme's example, or the leading pair's when no theme has one. */
  example: ExamplePair | null;
}

/** Everything the sections read, computed once per selection. */
export interface BriefData {
  countryName: string;
  scope: Scope;
  counts: ToneCounts;
  lead: OverallLead;
  pairs: DocPairStat[];
  /** Each document with all its target pairs, most closely aligned first. */
  docs: DocStat[];
  leading: { reinforce: DocPairStat | null; apart: DocPairStat | null };
  together: ThemeSection;
  apart: ThemeSection;
  concentration: Concentration;
  commitments: CommitmentRow[];
  aligned: AlignedRow[];
  areas: { rows: AreaRow[]; average: number; max: number } | null;
}

function themeSection(
  source: BriefSource,
  scope: Scope,
  type: "reinforcement" | "friction",
  lead: DocPairStat | null,
): ThemeSection {
  const { rows: ranked, exact } = themeRows(source, scope, type);
  const rows = ranked.map((row) => ({ ...row, example: themeExample(scope, row.storyline) }));
  let example = rows.find((row) => row.example)?.example ?? null;
  if (!example && lead) {
    example = pairExample(scope, lead.a.id, lead.b.id, type === "friction" ? "apart" : "reinforce");
  }
  return { rows, exact, example };
}

/** Key of the group holding a tone's target pairs outside every theme. */
export const OTHER_THEME = "__other";

/** Most themes a section shows; the pipeline writes three of each kind. */
export const MAX_THEMES = 3;

/**
 * A tone's target pairs as dot groups: one per theme shown, sized by its
 * coverage (see `themeRows`), then the pairs between documents no shown
 * theme cites. Themes may share pairs of documents, so the groups can add
 * up to more than the tone's total; the rest never double counts.
 */
export function themeDots(
  data: BriefData,
  tone: "reinforce" | "apart",
): { key: string; count: number }[] {
  const rows = (tone === "reinforce" ? data.together : data.apart).rows.slice(0, MAX_THEMES);
  const groups = rows.map((r) => ({ key: r.storyline.name, count: r.count }));
  const covered = new Set(rows.flatMap((r) => [...getStorylineDocPairKeys(r.storyline)]));
  const other = data.scope.comparisons.filter(
    (c) => toneOf(c.level) === tone && !covered.has(getDocPairKey(c.a.doc, c.b.doc)),
  ).length;
  return other > 0 ? [...groups, { key: OTHER_THEME, count: other }] : groups;
}

export function buildBriefData(source: BriefSource, scope: Scope, lens: LensId | null): BriefData {
  const pairs = docPairStats(scope);
  const leading = {
    reinforce: leadingPair(pairs, "reinforce"),
    apart: leadingPair(pairs, "apart"),
  };
  const counts = toneCounts(scope.comparisons);
  return {
    countryName: source.countryName,
    scope,
    counts,
    lead: overallLead(counts),
    pairs,
    docs: docStats(scope),
    leading,
    together: themeSection(source, scope, "reinforcement", leading.reinforce),
    apart: themeSection(source, scope, "friction", leading.apart),
    concentration: concentrationOf(scope),
    commitments: commitmentsToReview(scope, 8),
    aligned: alignedTargets(scope, 8),
    areas: lens ? areaRows(source, scope, lens) : null,
  };
}
