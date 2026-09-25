import type { AlignmentLevel, AlignmentMechanism } from "@/types";
import type { Scope, ToneCounts } from "../compute";
import { LEVEL_CODES, MECHANISM_CODES, type BriefCommitment, type BriefDocument, type BriefLens } from "../source";
import type { ExploreLayers, LayerId, LayerItem } from "./layers";

/**
 * The explorer's model: every target in scope, then (where the country has
 * them) the reported actions and budget lines, and how any two of them read
 * against each other. Kept as flat n×n tables so the ring can re-read every
 * seat against a new centre without searching the comparisons.
 */

/** What a seat stands for. */
export type SeatKind = "target" | "action" | "budget";

export interface ExploreItem extends BriefCommitment {
  kind: SeatKind;
  layer?: LayerId;
  /** For actions and budget lines, the fields of their `LayerItem`. */
  name?: string;
  code?: string;
  status?: string;
  spend?: LayerItem["spend"];
}

/** How a seat reads against the target in the centre. */
export type Relation = "apart" | "partial" | "none" | "unrelated" | "aligned" | "strong";

/** Order of the seats within an arc: potential misalignment from one end,
 *  strong alignment at the other, as in the brief's result bar. Targets that
 *  were not compared (the centre's own document) sit in the middle. */
export const SEAT_ORDER: Relation[] = ["apart", "partial", "none", "unrelated", "aligned", "strong"];

/** Key of the arc holding the targets outside every area of a lens. */
export const OTHER_GROUP = "__other";

export interface ExploreModel {
  items: ExploreItem[];
  /** Seats before this index are targets; the rest are layer items. */
  targets: number;
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

/** The arc key (and document id) of a layer's seats. */
export function layerDoc(layer: LayerId): string {
  return `layer:${layer}`;
}

export function buildExploreModel(scope: Scope, layers?: ExploreLayers | null): ExploreModel {
  const items: ExploreItem[] = [
    ...scope.commitments.map((c) => ({ ...c, kind: "target" as const })),
    ...(layers?.items ?? []).map((it) => ({
      id: it.id,
      doc: layerDoc(it.layer),
      label: it.label,
      text: it.text,
      kind: it.layer === "budget" ? ("budget" as const) : ("action" as const),
      layer: it.layer,
      name: it.name,
      ...(it.code ? { code: it.code } : {}),
      ...(it.status ? { status: it.status } : {}),
      ...(it.spend ? { spend: it.spend } : {}),
    })),
  ];
  const n = items.length;
  const index = new Map(items.map((c, i) => [c.id, i]));
  const levels = new Uint8Array(n * n);
  const mechanisms = new Uint8Array(n * n);
  const set = (a: number, b: number, level: number, mechanism: number) => {
    levels[a * n + b] = level;
    levels[b * n + a] = level;
    mechanisms[a * n + b] = mechanism;
    mechanisms[b * n + a] = mechanism;
  };
  for (const c of scope.comparisons) {
    const a = index.get(c.a.id);
    const b = index.get(c.b.id);
    if (a === undefined || b === undefined) continue;
    set(a, b, LEVEL_CODES.indexOf(c.level) + 1, Math.max(0, MECHANISM_CODES.indexOf(c.mechanism ?? null)));
  }
  const offset = scope.commitments.length;
  for (const [targetId, item, level, mechanism] of layers?.links ?? []) {
    const a = index.get(targetId);
    if (a === undefined || a >= offset) continue;
    set(a, offset + item, level + 1, mechanism);
  }
  return { items, targets: offset, index, levels, mechanisms };
}

export function levelBetween(model: ExploreModel, a: number, b: number): AlignmentLevel | null {
  const code = model.levels[a * model.items.length + b];
  return code === 0 ? null : LEVEL_CODES[code - 1];
}

export function mechanismBetween(model: ExploreModel, a: number, b: number): AlignmentMechanism | null {
  return MECHANISM_CODES[model.mechanisms[a * model.items.length + b]] ?? null;
}

/**
 * How two seats read against each other. Two targets read as the pipeline
 * rated them. A reported action counts only when strongly aligned with a
 * target, or when it may pull against it; a budget line only when it
 * matches. Any other reading of a layer is kept (for its tooltip) but reads
 * as no clear relationship. Actions and budget lines are not compared with
 * each other.
 */
export function relationBetween(model: ExploreModel, a: number, b: number): Relation | null {
  const level = levelBetween(model, a, b);
  if (level === null) return null;
  const ka = model.items[a].kind;
  const kb = model.items[b].kind;
  if (ka === "target" && kb === "target") return relationOf(level);
  const layer = ka === "target" ? kb : ka;
  if (level === "high") return "strong";
  if (level === "flagged" && layer === "action") return "apart";
  return "none";
}

/** How `other` reads against the target in the centre. */
export function seatRelation(model: ExploreModel, focus: number, other: number): Relation {
  return relationBetween(model, focus, other) ?? "unrelated";
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
    if (i === focus || item.kind !== "target") return;
    const relation = relationBetween(model, focus, i);
    if (relation === null) return;
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
 *  lens leaves outside every area. Layer seats are not in any area. */
export function groupByLens(model: ExploreModel, lens: BriefLens): SeatGroup[] {
  const targets = model.items.slice(0, model.targets);
  const groups = lens.categories.map((cat) => ({
    key: cat.id,
    ids: targets.flatMap((c, i) => (lens.primary[c.id] === cat.id ? [i] : [])),
  }));
  const known = new Set(lens.categories.map((c) => c.id));
  const other = targets.flatMap((c, i) => (known.has(lens.primary[c.id] ?? "") ? [] : [i]));
  return [...groups, { key: OTHER_GROUP, ids: other }].filter((g) => g.ids.length > 0);
}

/** One arc per layer, in LAYER order, for the layers switched on. */
export function groupByLayer(model: ExploreModel, layers: LayerId[]): SeatGroup[] {
  return layers
    .map((layer) => ({
      key: layerDoc(layer),
      ids: model.items.flatMap((c, i) => (c.layer === layer ? [i] : [])),
    }))
    .filter((g) => g.ids.length > 0);
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
