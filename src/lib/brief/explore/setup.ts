import type { BerNames } from "../ber-names";
import type { LinkParams } from "../link";
import type { TargetLabels } from "../target-labels";
import type { BriefSource } from "../source";
import { focusKey } from "./focus";
import { buildExploreLayers, layerIdsOf, type ExploreLayers } from "./layers";
import { parseExploreState, type ExploreGroup, type ExploreState } from "./state";

export interface ExploreSetup {
  layers: ExploreLayers | null;
  groups: ExploreGroup[];
}

/**
 * Everything the explorer needs from the server: its finance and
 * implementation layers, and the groupings on offer. The same for every
 * reader; a link's part is read in the browser (`exploreFromLink`).
 */
export function exploreSetup(args: {
  data: Record<string, unknown>;
  source: BriefSource;
  /** The page's language, for the budget lines' names and descriptions. */
  locale?: string;
  /** The country's display names for its budget lines, where it has them. */
  berNames?: BerNames | null;
  /** Its reported actions' titles and texts in languages the report does
   *  not give, where it has them. */
  targetLabels?: TargetLabels | null;
}): ExploreSetup {
  const { data, source, locale, berNames, targetLabels } = args;
  const layers = buildExploreLayers(data, source, { locale, names: berNames, labels: targetLabels });
  // Every lens the source holds; a lens seats only the targets in its areas
  // (the human rights lens few of them) and says so beside the choice.
  const groups: ExploreGroup[] = ["docs", ...source.lenses.map((l) => l.id)];
  return { layers, groups };
}

/**
 * The explorer's part of a link: what is in the centre, the grouping, the
 * layers, and a comparison to open beside the centre. Anything the link
 * names that is not in the selection is ignored.
 */
export function exploreFromLink(args: {
  params: LinkParams;
  source: BriefSource;
  docs: string[];
  setup: ExploreSetup;
}): { state: ExploreState; pair: { a: string; b: string } | null } {
  const { params, source, docs, setup } = args;
  const inScope = new Set(docs);
  const ids = new Set([
    ...source.commitments.filter((c) => inScope.has(c.doc)).map((c) => c.id),
    ...docs.map((id) => focusKey({ kind: "doc", id })),
    ...source.lenses.flatMap((l) => l.categories.map((c) => focusKey({ kind: "area", lens: l.id, id: c.id }))),
    ...(setup.layers ? layerIdsOf(setup.layers) : []),
  ]);
  const state = parseExploreState(params, ids, setup.groups);
  const pair = params.pair;
  const [a, b] = String(Array.isArray(pair) ? pair[0] : (pair ?? "")).split("~");
  return { state, pair: state.focus && state.focus === a && ids.has(b) ? { a, b } : null };
}
