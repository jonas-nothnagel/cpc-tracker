import type { AlignmentLevel, AlignmentMechanism } from "@/types";
import type { Scope, ToneCounts } from "../compute";
import { LEVEL_CODES, MECHANISM_CODES, type BriefCommitment, type BriefDocument, type BriefLens } from "../source";

/**
 * The explorer's model: every target in scope, and how any two of them read
 * against each other. Kept as flat n×n tables so the ring can re-read every
 * seat against a new target in the centre without searching the comparisons.
 */

/** How a seat reads against the target in the centre. */
export type Relation = "apart" | "partial" | "none" | "unrelated" | "aligned" | "strong";

/** Order of the seats within an arc: potential misalignment from one end,
 *  strong alignment at the other, as in the brief's result bar. Targets that
 *  were not compared (the centre's own document) sit in the middle. */
export const SEAT_ORDER: Relation[] = ["apart", "partial", "none", "unrelated", "aligned", "strong"];

/** Key of the arc holding the targets outside every area of a lens. */
export const OTHER_GROUP = "__other";

export interface ExploreModel {
  items: BriefCommitment[];
  index: Map<string, number>;
  /** Row-major n×n: index into LEVEL_CODES plus one; 0 where not compared. */
  levels: Uint8Array;
  /** Row-major n×n: index into MECHANISM_CODES. */
  mechanisms: Uint8Array;
}

export function relationOf(level: AlignmentLevel): Relation {
  switch (level) {
    case "high":
      return "strong";
    case "medium":
      return "aligned";
    case "low":
      return "partial";
    case "flagged":
      return "apart";
    default:
      return "none";
  }
}

export function buildExploreModel(scope: Scope): ExploreModel {
  const items = scope.commitments;
  const n = items.length;
  const index = new Map(items.map((c, i) => [c.id, i]));
  const levels = new Uint8Array(n * n);
  const mechanisms = new Uint8Array(n * n);
  for (const c of scope.comparisons) {
    const a = index.get(c.a.id);
    const b = index.get(c.b.id);
    if (a === undefined || b === undefined) continue;
    const level = LEVEL_CODES.indexOf(c.level) + 1;
    const mechanism = Math.max(0, MECHANISM_CODES.indexOf(c.mechanism ?? null));
    levels[a * n + b] = level;
    levels[b * n + a] = level;
    mechanisms[a * n + b] = mechanism;
    mechanisms[b * n + a] = mechanism;
  }
  return { items, index, levels, mechanisms };
}

export function levelBetween(model: ExploreModel, a: number, b: number): AlignmentLevel | null {
  const code = model.levels[a * model.items.length + b];
  return code === 0 ? null : LEVEL_CODES[code - 1];
}

export function mechanismBetween(model: ExploreModel, a: number, b: number): AlignmentMechanism | null {
  return MECHANISM_CODES[model.mechanisms[a * model.items.length + b]] ?? null;
}

/** How `other` reads against the target in the centre. */
export function seatRelation(model: ExploreModel, focus: number, other: number): Relation {
  const level = levelBetween(model, focus, other);
  return level === null ? "unrelated" : relationOf(level);
}

export type RelationCounts = Record<Relation, number>;

function emptyRelations(): RelationCounts {
  return { apart: 0, partial: 0, none: 0, unrelated: 0, aligned: 0, strong: 0 };
}

export interface FocusProfile {
  /** Comparisons of the target in the centre. */
  total: number;
  counts: RelationCounts;
  /** The same counts per document of the partner. */
  byGroup: Map<string, RelationCounts>;
  /** Partners of each reading, in document order. */
  partners: Record<Relation, number[]>;
}

export function focusProfile(model: ExploreModel, focus: number): FocusProfile {
  const counts = emptyRelations();
  const byGroup = new Map<string, RelationCounts>();
  const partners: Record<Relation, number[]> = {
    apart: [],
    partial: [],
    none: [],
    unrelated: [],
    aligned: [],
    strong: [],
  };
  let total = 0;
  model.items.forEach((item, i) => {
    if (i === focus) return;
    const level = levelBetween(model, focus, i);
    if (level === null) return;
    const relation = relationOf(level);
    total += 1;
    counts[relation] += 1;
    partners[relation].push(i);
    const group = byGroup.get(item.doc) ?? emptyRelations();
    group[relation] += 1;
    byGroup.set(item.doc, group);
  });
  return { total, counts, byGroup, partners };
}

/** The brief's tone counts (aligned = strong + moderate) for its result bar. */
export function toneCountsOf(profile: Pick<FocusProfile, "counts" | "total">): ToneCounts {
  const c = profile.counts;
  return {
    reinforce: c.strong + c.aligned,
    partial: c.partial,
    apart: c.apart,
    none: c.none,
    total: profile.total,
  };
}

export interface SeatGroup {
  key: string;
  ids: number[];
}

/** One arc per document, in document order. */
export function groupByDocument(model: ExploreModel, docs: Pick<BriefDocument, "id">[]): SeatGroup[] {
  return docs
    .map((d) => ({ key: d.id, ids: model.items.flatMap((c, i) => (c.doc === d.id ? [i] : [])) }))
    .filter((g) => g.ids.length > 0);
}

/** One arc per policy area of a lens (its own order), then the targets the
 *  lens leaves outside every area. */
export function groupByLens(model: ExploreModel, lens: BriefLens): SeatGroup[] {
  const groups = lens.categories.map((cat) => ({
    key: cat.id,
    ids: model.items.flatMap((c, i) => (lens.primary[c.id] === cat.id ? [i] : [])),
  }));
  const known = new Set(lens.categories.map((c) => c.id));
  const other = model.items.flatMap((c, i) => (known.has(lens.primary[c.id] ?? "") ? [] : [i]));
  return [...groups, { key: OTHER_GROUP, ids: other }].filter((g) => g.ids.length > 0);
}

/** Seats of one arc in the order they sit: document order at rest; with a
 *  target in the centre, by how each reads against it (stable). */
export function seatOrder(model: ExploreModel, ids: number[], focus: number | null): number[] {
  if (focus === null) return ids;
  const rank = (i: number) => SEAT_ORDER.indexOf(seatRelation(model, focus, i));
  return ids
    .map((id, k) => ({ id, k, r: rank(id) }))
    .sort((x, y) => x.r - y.r || x.k - y.k)
    .map((x) => x.id);
}

/** How the seats of one arc read against the target in the centre. */
export function arcTally(model: ExploreModel, ids: number[], focus: number): RelationCounts {
  const tally = emptyRelations();
  for (const id of ids) {
    if (id === focus) continue;
    tally[seatRelation(model, focus, id)] += 1;
  }
  return tally;
}
