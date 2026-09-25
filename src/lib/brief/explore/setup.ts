import type { BriefSource } from "../source";
import { focusKey } from "./focus";
import { buildExploreLayers, layerIdsOf, type ExploreLayers } from "./layers";
import { parseExploreState, type ExploreGroup, type ExploreState } from "./state";

/** Lenses the ring can group by. The human rights lens is a draft whose
 *  areas leave most targets unclassified, so it is not offered here. */
const RING_LENSES = new Set(["globe", "ipcc", "gga"]);

export interface ExploreSetup {
  layers: ExploreLayers | null;
  groups: ExploreGroup[];
  initialState: ExploreState;
  /** A comparison to open beside the centre, from a shared link. */
  initialPair: { a: string; b: string } | null;
}

type Params = Record<string, string | string[] | undefined>;

/**
 * Everything the explorer needs from the server: its finance and
 * implementation layers, the groupings on offer, and its part of the link
 * (what is in the centre, the grouping, the layers, an open comparison).
 * Anything a link names that is not in the selection is ignored.
 */
export function exploreSetup(args: {
  data: Record<string, unknown>;
  source: BriefSource;
  docs: string[];
  searchParams: Params;
}): ExploreSetup {
  const { data, source, docs, searchParams } = args;
  const layers = buildExploreLayers(data, source);
  const groups: ExploreGroup[] = ["docs", ...source.lenses.map((l) => l.id).filter((id) => RING_LENSES.has(id))];
  const inScope = new Set(docs);
  const ids = new Set([
    ...source.commitments.filter((c) => inScope.has(c.doc)).map((c) => c.id),
    ...docs.map((id) => focusKey({ kind: "doc", id })),
    ...source.lenses
      .filter((l) => RING_LENSES.has(l.id))
      .flatMap((l) => l.categories.map((c) => focusKey({ kind: "area", lens: l.id, id: c.id }))),
    ...(layers ? layerIdsOf(layers) : []),
  ]);
  const initialState = parseExploreState(searchParams, ids, groups);
  const pair = searchParams.pair;
  const [a, b] = String(Array.isArray(pair) ? pair[0] : (pair ?? "")).split("~");
  const initialPair = initialState.focus && initialState.focus === a && ids.has(b) ? { a, b } : null;
  return { layers, groups, initialState, initialPair };
}
