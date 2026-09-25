import type { BriefLens, LensId } from "../source";
import { levelBetween, relationOf, type ExploreModel, type Relation, type RelationCounts } from "./model";

/**
 * What can take the centre of the ring: one target, a whole document, or a
 * policy area of a lens. Each is a group of targets; a target is a group of
 * one, so the ring reads every other seat against the centre the same way.
 */

export type FocusRef =
  | { kind: "target"; id: string }
  | { kind: "doc"; id: string }
  | { kind: "area"; lens: LensId; id: string };

/** One string per focus, for the state, the trail and links. Target ids
 *  carry no colon, so a plain id is a target. */
export function focusKey(ref: FocusRef): string {
  if (ref.kind === "doc") return `doc:${ref.id}`;
  if (ref.kind === "area") return `area:${ref.lens}:${ref.id}`;
  return ref.id;
}

export function parseFocusKey(key: string): FocusRef {
  if (key.startsWith("doc:")) return { kind: "doc", id: key.slice(4) };
  if (key.startsWith("area:")) {
    const [lens, ...rest] = key.slice(5).split(":");
    return { kind: "area", lens: lens as LensId, id: rest.join(":") };
  }
  return { kind: "target", id: key };
}

/** The targets a focus stands for, in model order. */
export function focusMembers(model: ExploreModel, ref: FocusRef, lenses: BriefLens[]): number[] {
  if (ref.kind === "target") {
    const i = model.index.get(ref.id);
    return i === undefined ? [] : [i];
  }
  if (ref.kind === "doc") return model.items.flatMap((c, i) => (c.doc === ref.id ? [i] : []));
  const lens = lenses.find((l) => l.id === ref.lens);
  if (!lens) return [];
  return model.items.flatMap((c, i) => (lens.primary[c.id] === ref.id ? [i] : []));
}

function empty(): RelationCounts {
  return { apart: 0, partial: 0, none: 0, unrelated: 0, aligned: 0, strong: 0 };
}

/** A seat's reading of a group: its strongest signal first. Potential
 *  misalignment leads, as the reading most worth a review. */
const PRECEDENCE: Relation[] = ["apart", "strong", "aligned", "partial", "none"];

/** How a seat mostly reads against the centre: the brief's four tones, or
 *  unrelated for the centre's own targets and seats never compared. */
export type SeatTone = "reinforce" | "partial" | "none" | "apart" | "unrelated";

/** Order of the seats within an arc by tone: potential misalignment from
 *  one end, alignment at the other, as in the brief's result bar. */
const TONE_ORDER: SeatTone[] = ["apart", "partial", "none", "unrelated", "reinforce"];

/** The reading most of a seat's pairs have; potential misalignment wins a
 *  tie, as the reading worth a review. */
function toneOf(p: RelationCounts): SeatTone {
  const readings: [SeatTone, number][] = [
    ["apart", p.apart],
    ["reinforce", p.strong + p.aligned],
    ["partial", p.partial],
    ["none", p.none],
  ];
  const best = readings.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : "unrelated";
}

export interface GroupProfile {
  members: number[];
  isMember: Uint8Array;
  /** Per seat: its target pairs with the group, by reading (zero for members). */
  pairs: RelationCounts[];
  /** Per seat: its strongest signal with the group (any potential
   *  misalignment first); "unrelated" for members and seats never compared. */
  relation: Relation[];
  /** Per seat: the reading most of its pairs with the group have. For a
   *  single target this is the one reading. */
  tone: SeatTone[];
  /** All target pairs between the group and the rest, by reading. */
  totals: RelationCounts;
  total: number;
}

export function groupProfile(model: ExploreModel, members: number[]): GroupProfile {
  const n = model.items.length;
  const isMember = new Uint8Array(n);
  for (const m of members) isMember[m] = 1;
  const pairs = Array.from({ length: n }, empty);
  const totals = empty();
  let total = 0;
  for (let j = 0; j < n; j++) {
    if (isMember[j]) continue;
    for (const m of members) {
      const level = levelBetween(model, m, j);
      if (level === null) continue;
      const relation = relationOf(level);
      pairs[j][relation] += 1;
      totals[relation] += 1;
      total += 1;
    }
  }
  const relation = pairs.map((p, j) =>
    isMember[j] ? "unrelated" : (PRECEDENCE.find((r) => p[r] > 0) ?? "unrelated"),
  );
  const tone = pairs.map((p, j) => (isMember[j] ? "unrelated" : toneOf(p)));
  return { members, isMember, pairs, relation, tone, totals, total };
}

/** Seats of one arc in the order they sit against the group: by the reading
 *  most of their pairs have (potential misalignment from one end,
 *  alignment at the other); within a reading, the larger share of potential
 *  misalignment first, and strong alignment towards the far end. */
export function groupSeatOrder(ids: number[], profile: GroupProfile): number[] {
  const share = (id: number, key: "apart" | "strong") => {
    const p = profile.pairs[id];
    const total = p.apart + p.partial + p.none + p.aligned + p.strong;
    return total > 0 ? p[key] / total : 0;
  };
  return ids
    .map((id, k) => ({
      id,
      k,
      r: TONE_ORDER.indexOf(profile.tone[id]),
      apart: share(id, "apart"),
      strong: share(id, "strong"),
    }))
    .sort((x, y) => x.r - y.r || y.apart - x.apart || x.strong - y.strong || x.k - y.k)
    .map((x) => x.id);
}

export interface RankedMember {
  id: number;
  count: number;
}

/** The group's own targets by their potential misalignments and by their
 *  strong alignments with targets outside it (most first, then order). */
export function rankMembers(
  model: ExploreModel,
  profile: GroupProfile,
): { apart: RankedMember[]; strong: RankedMember[] } {
  const apart = new Map<number, number>();
  const strong = new Map<number, number>();
  for (const m of profile.members) {
    apart.set(m, 0);
    strong.set(m, 0);
  }
  model.items.forEach((_, j) => {
    if (profile.isMember[j]) return;
    for (const m of profile.members) {
      const level = levelBetween(model, m, j);
      if (level === "flagged") apart.set(m, apart.get(m)! + 1);
      else if (level === "high") strong.set(m, strong.get(m)! + 1);
    }
  });
  const ranked = (counts: Map<number, number>) =>
    [...counts.entries()]
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({ id, count }))
      .sort((x, y) => y.count - x.count || x.id - y.id);
  return { apart: ranked(apart), strong: ranked(strong) };
}

/**
 * The target pairs of one reading between the group and a set of other
 * seats, most recurring targets first: pairs of the group's target that
 * takes part in the most of them lead, and within those, the other side's
 * busiest target. A pair is [group target, other target].
 */
export function pairsBetween(
  model: ExploreModel,
  members: number[],
  others: number[],
  reading: "strong" | "apart",
): [number, number][] {
  const level = reading === "strong" ? "high" : "flagged";
  const inGroup = new Set(members);
  const pairs: [number, number][] = [];
  for (const m of members) {
    for (const o of others) {
      if (inGroup.has(o)) continue;
      if (levelBetween(model, m, o) === level) pairs.push([m, o]);
    }
  }
  const mine = new Map<number, number>();
  const theirs = new Map<number, number>();
  for (const [m, o] of pairs) {
    mine.set(m, (mine.get(m) ?? 0) + 1);
    theirs.set(o, (theirs.get(o) ?? 0) + 1);
  }
  return pairs.sort(
    ([m1, o1], [m2, o2]) =>
      mine.get(m2)! - mine.get(m1)! || m1 - m2 || theirs.get(o2)! - theirs.get(o1)! || o1 - o2,
  );
}
