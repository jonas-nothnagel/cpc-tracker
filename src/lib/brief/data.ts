import {
  areaRows,
  commitmentsToReview,
  concentrationOf,
  docPairStats,
  leadingPair,
  mapCells,
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
  type MapCell,
  type Scope,
  type ThemeRow,
  type OverallLead,
  type ToneCounts,
} from "./compute";
import type { BriefSource, LensId } from "./source";

export interface ThemeSection {
  rows: ThemeRow[];
  /** Theme names were written for exactly this selection of documents. */
  exact: boolean;
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
  cells: MapCell[];
  areas: { rows: AreaRow[]; average: number; max: number } | null;
}

function themeSection(
  source: BriefSource,
  scope: Scope,
  type: "reinforcement" | "friction",
  lead: DocPairStat | null,
): ThemeSection {
  const { rows, exact } = themeRows(source, scope, type);
  let example: ExamplePair | null = null;
  for (const row of rows) {
    example = themeExample(scope, row.storyline);
    if (example) break;
  }
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
    cells: mapCells(scope),
    areas: lens ? areaRows(source, scope, lens) : null,
  };
}
