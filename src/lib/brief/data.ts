import {
  areaRows,
  commitmentsToReview,
  concentrationOf,
  docPairStats,
  leadingPair,
  pairExample,
  themeExample,
  themeRows,
  overallLead,
  toneCounts,
  type AreaRow,
  type CommitmentRow,
  type Concentration,
  type DocPairStat,
  type ExamplePair,
  type Scope,
  type ThemeRow,
  type OverallLead,
  type ToneCounts,
} from "./compute";
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
  leading: { reinforce: DocPairStat | null; apart: DocPairStat | null };
  together: ThemeSection;
  apart: ThemeSection;
  concentration: Concentration;
  commitments: CommitmentRow[];
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
    leading,
    together: themeSection(source, scope, "reinforcement", leading.reinforce),
    apart: themeSection(source, scope, "friction", leading.apart),
    concentration: concentrationOf(scope),
    commitments: commitmentsToReview(scope, 8),
    areas: lens ? areaRows(source, scope, lens) : null,
  };
}
