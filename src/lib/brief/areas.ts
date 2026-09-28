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

/** What the picture shows: every target at rest, one pair of areas, or one target. */
export type AreaFocus = { kind: "rest" } | { kind: "pair"; pair: AreaPair } | { kind: "target"; id: string };

/** A target's dot: in ink, set back, a partner of the picked target, or the picked target. */
export type TargetInk = "base" | "pale" | "lit" | "focus";

/** Each placed target's point cloud at rest: its number of the side's target pairs. */
export function restClouds(lens: LensAreas, links: SideLinks, side: AreaSide): Map<string, number> {
  const out = new Map<string, number>();
  for (const area of lens.areas) for (const id of area.targets) out.set(id, links[side].get(id)?.length ?? 0);
  return out;
}

/** Each placed target's point cloud now: as at rest; with a pair of areas
 *  open, only its target pairs there (none in the other rows); none around
 *  a picked target. */
export function cloudSizes(lens: LensAreas, links: SideLinks, side: AreaSide, focus: AreaFocus): Map<string, number> {
  if (focus.kind === "rest") return restClouds(lens, links, side);
  const pair = focus.kind === "pair" ? focus.pair : null;
  const out = new Map<string, number>();
  for (const area of lens.areas) {
    const inPair = pair !== null && (area.id === pair.a || area.id === pair.b);
    for (const id of area.targets) out.set(id, inPair && pair ? (pair.involvement.get(id) ?? 0) : 0);
  }
  return out;
}

/** Each area's row with its targets in drawing order: the tallest clouds at
 *  rest first (then document order); in the open pair of areas' two rows,
 *  the tallest clouds of that pair first; around a picked target, its
 *  partners first in their rows, while its own row keeps the order it had
 *  (`basis`: at rest, or with a pair of areas open), so the target stays
 *  under the pointer and a second pick at the same spot lets it go. */
export function rowOrder(
  lens: LensAreas,
  rest: Map<string, number>,
  clouds: Map<string, number>,
  focus: AreaFocus,
  links: SideLinks,
  side: AreaSide,
  basis: AreaFocus = { kind: "rest" },
): { id: string; targets: string[] }[] {
  const picked = focus.kind === "target" ? focus.id : null;
  const partners = picked ? new Set(links[side].get(picked) ?? []) : null;
  const pair = focus.kind === "pair" ? focus.pair : basis.kind === "pair" ? basis.pair : null;
  return lens.areas.map((area) => {
    const index = new Map(area.targets.map((id, i) => [id, i]));
    const byRest = (x: string, y: string) =>
      (rest.get(y) ?? 0) - (rest.get(x) ?? 0) || (index.get(x) ?? 0) - (index.get(y) ?? 0);
    const inPair = pair !== null && (area.id === pair.a || area.id === pair.b);
    const byPair = (x: string, y: string) =>
      (pair?.involvement.get(y) ?? 0) - (pair?.involvement.get(x) ?? 0) || byRest(x, y);
    const targets = [...area.targets];
    if (picked && partners && !area.targets.includes(picked)) {
      const rank = (id: string) => (partners.has(id) ? 0 : 1);
      targets.sort((x, y) => rank(x) - rank(y) || byRest(x, y));
    } else if (inPair) {
      targets.sort(byPair);
    } else {
      targets.sort(byRest);
    }
    return { id: area.id, targets };
  });
}

/** "N of M targets" beside a row: its targets taking part in the open pair
 *  of areas, or the picked target's partners in it. None at rest. */
export function rowCounts(lens: LensAreas, focus: AreaFocus, links: SideLinks, side: AreaSide): Map<string, number> {
  const out = new Map<string, number>();
  if (focus.kind === "pair") {
    const { pair } = focus;
    for (const area of lens.areas) {
      if (area.id !== pair.a && area.id !== pair.b) continue;
      out.set(area.id, area.targets.filter((id) => (pair.involvement.get(id) ?? 0) > 0).length);
    }
  } else if (focus.kind === "target") {
    const partners = new Set(links[side].get(focus.id) ?? []);
    for (const area of lens.areas) {
      const count = area.targets.filter((id) => partners.has(id)).length;
      if (count > 0) out.set(area.id, count);
    }
  }
  return out;
}

/** Each placed target's ink in the current state. */
export function targetInks(lens: LensAreas, focus: AreaFocus, links: SideLinks, side: AreaSide): Map<string, TargetInk> {
  const out = new Map<string, TargetInk>();
  const picked = focus.kind === "target" ? focus.id : null;
  const partners = picked ? new Set(links[side].get(picked) ?? []) : null;
  const pair = focus.kind === "pair" ? focus.pair : null;
  for (const area of lens.areas) {
    const inPair = pair !== null && (area.id === pair.a || area.id === pair.b);
    for (const id of area.targets) {
      if (picked) out.set(id, id === picked ? "focus" : partners?.has(id) ? "lit" : "pale");
      else if (pair) out.set(id, inPair ? "base" : "pale");
      else out.set(id, "base");
    }
  }
  return out;
}

/** The picked target's partners on the side: by area (most first, then the
 *  taxonomy's order), those outside the lens, and all of them. */
export function partnersByArea(
  lens: LensAreas,
  links: SideLinks,
  side: AreaSide,
  id: string,
): { areas: { id: string; count: number }[]; outside: number; total: number } {
  const p = placing(lens);
  const partners = links[side].get(id) ?? [];
  const counts = new Map<string, number>();
  let outside = 0;
  for (const other of partners) {
    const area = p.areaOf.get(other);
    if (area) counts.set(area, (counts.get(area) ?? 0) + 1);
    else outside += 1;
  }
  const areas = [...counts.entries()]
    .map(([area, count]) => ({ id: area, count }))
    .sort((x, y) => y.count - x.count || (p.order.get(x.id) ?? 0) - (p.order.get(y.id) ?? 0));
  return { areas, outside, total: partners.length };
}

/** One pair of areas for its panel: the side's target pairs, those of the
 *  most involved targets first, and all the target pairs between the two. */
export function areaPairDetail(
  lens: LensAreas,
  scope: Scope,
  side: AreaSide,
  key: string,
): { rows: ScopedComparison[]; pairs: number } {
  const p = placing(lens);
  const level = sideLevel(side);
  const inPair = scope.comparisons.filter((c) => pairOf(c, p)?.key === key);
  const rows = inPair.filter((c) => c.level === level);
  const involvement = new Map<string, number>();
  for (const c of rows) for (const id of [c.a.id, c.b.id]) involvement.set(id, (involvement.get(id) ?? 0) + 1);
  const busy = (c: ScopedComparison) => Math.max(involvement.get(c.a.id) ?? 0, involvement.get(c.b.id) ?? 0);
  const calm = (c: ScopedComparison) => Math.min(involvement.get(c.a.id) ?? 0, involvement.get(c.b.id) ?? 0);
  const keyOf = (c: ScopedComparison) => `${c.a.id}__${c.b.id}`;
  rows.sort((x, y) => busy(y) - busy(x) || calm(y) - calm(x) || (keyOf(x) < keyOf(y) ? -1 : keyOf(x) > keyOf(y) ? 1 : 0));
  return { rows, pairs: inPair.length };
}
