import type { Scope, ScopedComparison } from "./compute";
import { sideLevel, type HubTone } from "./hub";
import type { BriefSource, LensId } from "./source";

/**
 * Policy areas on screen: the chosen lens's areas with the targets each
 * places, and the pairs of areas that target pairs fall between. A side is
 * read as in the overview: potential misalignment (`flagged`) or strong
 * alignment (`high`).
 */
export type AreaSide = HubTone;

/** Stands for the targets a lens does not place, in a pair of areas. */
export const OTHER_AREA = "__other";

/** Pairs of areas the list names; the rest are summed in one line. */
export const TOP_AREA_PAIRS = 6;

export interface LensArea {
  id: string;
  /** The category's name, without a trailing acronym in brackets. */
  name: string;
  /** That acronym ("LULUCF"), shown on request; null without one. */
  acronym: string | null;
  /** Position in the taxonomy's own order. */
  order: number;
  /** Targets in scope whose primary area this is, in document order. */
  targets: string[];
}

export interface LensAreas {
  /** Areas holding targets: most targets first, ties in the taxonomy's order. */
  areas: LensArea[];
  /** Targets in scope the lens places. */
  placed: number;
  /** Targets in scope. */
  total: number;
}

const ACRONYM = /\s*\(([A-Z][A-Z0-9&/-]{1,11})\)\s*$/;

/** A category's name for the page: a trailing acronym in brackets moves
 *  out (to a tooltip); the rest stays as the taxonomy writes it. */
export function splitAcronym(name: string): { name: string; acronym: string | null } {
  const m = ACRONYM.exec(name);
  return m ? { name: name.slice(0, m.index).trim(), acronym: m[1] } : { name, acronym: null };
}

/** The lens's areas with the targets in scope it places. */
export function lensAreas(source: BriefSource, scope: Scope, lensId: LensId): LensAreas {
  const total = scope.commitments.length;
  const lens = source.lenses.find((l) => l.id === lensId);
  if (!lens) return { areas: [], placed: 0, total };
  const byArea = new Map<string, string[]>();
  for (const c of scope.commitments) {
    const area = lens.primary[c.id];
    if (!area) continue;
    const list = byArea.get(area);
    if (list) list.push(c.id);
    else byArea.set(area, [c.id]);
  }
  const areas = lens.categories
    .map((cat, order) => ({ id: cat.id, ...splitAcronym(cat.name), order, targets: byArea.get(cat.id) ?? [] }))
    .filter((area) => area.targets.length > 0)
    .sort((x, y) => y.targets.length - x.targets.length || x.order - y.order);
  return { areas, placed: areas.reduce((sum, area) => sum + area.targets.length, 0), total };
}

/** Each target's partners on each side, within the scope. */
export type SideLinks = Record<AreaSide, Map<string, string[]>>;

export function sideLinks(scope: Scope): SideLinks {
  const links: SideLinks = { apart: new Map(), reinforce: new Map() };
  const add = (side: AreaSide, from: string, to: string) => {
    const list = links[side].get(from);
    if (list) list.push(to);
    else links[side].set(from, [to]);
  };
  for (const c of scope.comparisons) {
    for (const side of ["apart", "reinforce"] as const) {
      if (c.level !== sideLevel(side)) continue;
      add(side, c.a.id, c.b.id);
      add(side, c.b.id, c.a.id);
    }
  }
  return links;
}

export interface AreaPair {
  /** `a|b`: the taxonomy's order, the targets outside the lens last. */
  key: string;
  a: string;
  /** Another area, the same one (target pairs within an area), or OTHER_AREA. */
  b: string;
  /** Target pairs between the two areas (or within the one). */
  pairs: number;
  /** Of those, the side's. */
  count: number;
  /** Each target's number of the side's target pairs here. */
  involvement: Map<string, number>;
}

export interface AreaPairs {
  side: AreaSide;
  /** The pairs of areas holding the most of the side's target pairs: at
   *  most TOP_AREA_PAIRS, none without any. */
  top: AreaPair[];
  /** Every other pair of areas, summed. */
  rest: { groups: number; pairs: number; count: number };
  /** All the side's target pairs in scope, placed or not. */
  total: number;
}

export interface Placing {
  areaOf: Map<string, string>;
  order: Map<string, number>;
  name: Map<string, string>;
}

export function placing(lens: LensAreas): Placing {
  const areaOf = new Map<string, string>();
  for (const area of lens.areas) for (const id of area.targets) areaOf.set(id, area.id);
  return {
    areaOf,
    order: new Map(lens.areas.map((area) => [area.id, area.order])),
    name: new Map(lens.areas.map((area) => [area.id, area.name])),
  };
}

/** The pair of areas a target pair falls in; null when the lens places
 *  neither target. */
export function pairOf(c: ScopedComparison, p: Placing): { key: string; a: string; b: string } | null {
  const x = p.areaOf.get(c.a.id);
  const y = p.areaOf.get(c.b.id);
  if (!x && !y) return null;
  if (!x || !y) {
    const a = (x ?? y) as string;
    return { key: `${a}|${OTHER_AREA}`, a, b: OTHER_AREA };
  }
  const [a, b] = (p.order.get(x) ?? 0) <= (p.order.get(y) ?? 0) ? [x, y] : [y, x];
  return { key: `${a}|${b}`, a, b };
}

/** The side's target pairs by pair of areas: the list's rows and the rest. */
export function areaPairs(lens: LensAreas, scope: Scope, side: AreaSide): AreaPairs {
  const p = placing(lens);
  const level = sideLevel(side);
  const groups = new Map<string, AreaPair>();
  let total = 0;
  for (const c of scope.comparisons) {
    const on = c.level === level;
    if (on) total += 1;
    const at = pairOf(c, p);
    if (!at) continue;
    let group = groups.get(at.key);
    if (!group) {
      group = { ...at, pairs: 0, count: 0, involvement: new Map() };
      groups.set(at.key, group);
    }
    group.pairs += 1;
    if (!on) continue;
    group.count += 1;
    for (const id of [c.a.id, c.b.id]) group.involvement.set(id, (group.involvement.get(id) ?? 0) + 1);
  }
  // Ties: more target pairs first, then the areas' names; the targets
  // outside the lens after every area.
  const name = (id: string) => p.name.get(id) ?? "";
  const outside = (g: AreaPair) => (g.b === OTHER_AREA ? 1 : 0);
  const ranked = [...groups.values()].sort(
    (x, y) =>
      y.count - x.count ||
      y.pairs - x.pairs ||
      name(x.a).localeCompare(name(y.a)) ||
      outside(x) - outside(y) ||
      name(x.b).localeCompare(name(y.b)),
  );
  const top = ranked.filter((g) => g.count > 0).slice(0, TOP_AREA_PAIRS);
  const shown = new Set(top.map((g) => g.key));
  const others = ranked.filter((g) => !shown.has(g.key));
  return {
    side,
    top,
    rest: {
      groups: others.length,
      pairs: others.reduce((sum, g) => sum + g.pairs, 0),
      count: others.reduce((sum, g) => sum + g.count, 0),
    },
    total,
  };
}

export type AreaHeadline =
  | { kind: "none" }
  | { kind: "between" | "within" | "outside"; share: number; a: string; b: string };

/** What the headline says: the pair of areas holding the most of the side's
 *  target pairs, as a share of all of them. */
export function areaHeadline(pairs: AreaPairs): AreaHeadline {
  const lead = pairs.top[0];
  if (!lead || pairs.total === 0) return { kind: "none" };
  const kind = lead.a === lead.b ? "within" : lead.b === OTHER_AREA ? "outside" : "between";
  return { kind, share: lead.count / pairs.total, a: lead.a, b: lead.b };
}
