import { NO_AREA } from "./areas";
import type { Contract, LensKey } from "./model";
import { placeKey } from "./places";

/**
 * The page's one focus: a policy area (under the lens in use), a document and
 * a place, each optional. Every view answers the parts that are not its own
 * axis: the map is by place, so it applies the policy area and the document;
 * the policy areas apply the document and the place; and so on.
 */
export interface Focus {
  lens: LensKey;
  /** A category of the lens, NO_AREA for the contracts or targets it leaves out, or null. */
  area: string | null;
  /** A document id, or null. */
  doc: string | null;
  /** A place code (ISO 3166-2), NO_PLACE for no single place, or null. */
  place: string | null;
}

export function emptyFocus(lens: LensKey): Focus {
  return { lens, area: null, doc: null, place: null };
}

export function hasFocus(f: Focus): boolean {
  return f.area !== null || f.doc !== null || f.place !== null;
}

/** Which parts of the focus a view applies. */
export interface FocusParts {
  area?: boolean;
  doc?: boolean;
  place?: boolean;
}

/** What the focus needs to know about the brief: each target's document, and
 *  the lens in use (its categories and each target's primary one). */
export interface FocusContext {
  docOf: Map<string, string>;
  known: Set<string>;
  primary: Record<string, string>;
}

export function focusContext(args: {
  docOf: Map<string, string>;
  categories: { id: string }[];
  primary: Record<string, string>;
}): FocusContext {
  return { docOf: args.docOf, known: new Set(args.categories.map((c) => c.id)), primary: args.primary };
}

/** A contract's own policy area under the lens, NO_AREA where it has none the lens knows. */
export function contractArea(c: Contract, lens: LensKey, ctx: FocusContext): string {
  const a = c.areas[lens];
  return a && ctx.known.has(a) ? a : NO_AREA;
}

/** A target's own policy area under the lens, NO_AREA where the lens places it nowhere. */
export function targetArea(id: string, ctx: FocusContext): string {
  const a = ctx.primary[id];
  return a && ctx.known.has(a) ? a : NO_AREA;
}

export function contractInFocus(c: Contract, f: Focus, ctx: FocusContext, parts: FocusParts): boolean {
  if (parts.area && f.area !== null && contractArea(c, f.lens, ctx) !== f.area) return false;
  if (parts.doc && f.doc !== null && !c.matches.some((t) => ctx.docOf.get(t) === f.doc)) return false;
  if (parts.place && f.place !== null && placeKey(c) !== f.place) return false;
  return true;
}

export function targetInFocus(id: string, f: Focus, ctx: FocusContext, parts: Omit<FocusParts, "place">): boolean {
  if (parts.doc && f.doc !== null && ctx.docOf.get(id) !== f.doc) return false;
  if (parts.area && f.area !== null && targetArea(id, ctx) !== f.area) return false;
  return true;
}
