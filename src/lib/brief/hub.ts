import { getDocPairKey, getStorylineDocPairKeys } from "@/lib/coherence-briefing";
import type { AlignmentLevel, AlignmentMechanism } from "@/types";
import { toneOf, type Tone } from "./compute";
import { MAX_THEMES, type BriefData } from "./data";
import { DOT_ORDER, layoutGroups } from "./dot-layout";
import { targetLine } from "./text";

/**
 * The coherence overview on screen: one field of dots, one per target pair,
 * that re-forms for each step of the overview. The same particles move
 * between stages: the ratings side by side, then the map of documents (each
 * dot at its two targets), then each side of it as its own landscape, and a
 * document in the centre with its pairs around it.
 */
export type HubTone = "reinforce" | "apart";

/** What the map brings forward. */
export type MapFocus =
  /** The fewest targets that take part in half of a side's pairs, when they
   *  are few (see `Concentration`). */
  | { kind: "top" }
  /** A shown theme of the side: its pairs between the documents it cites. */
  | { kind: "theme"; index: number }
  | { kind: "mechanism"; mechanism: AlignmentMechanism }
  /** A document: its row and column. */
  | { kind: "doc"; doc: string }
  /** A target: its row and column. */
  | { kind: "target"; id: string };

export type HubStage =
  | { kind: "overview" }
  /**
   * The map of documents. With a `side`, that side's own landscape: only its
   * pairs (strong alignments, or potential misalignments), and within each
   * document the targets that carry the side first, named. Without one,
   * every pair where its two targets meet; `tone` brings one rating forward.
   */
  | { kind: "map"; side?: HubTone; tone?: Tone; focus?: MapFocus }
  | { kind: "doc"; doc: string };

/** Targets each list of the overview shows at least. */
export const HUB_TOP = 6;

/** Most targets a side names from its headline; when its headline names
 *  more, the first of its list are named instead. */
export const NAMED_MAX = 8;

/** Line height of a named target on the map (0.75rem type); a name that
 *  takes two lines is `2 * MARK_LINE - 2` high. */
export const MARK_LINE = 15;
/** Least room a named target's name needs; with less it is left to the list. */
const MARK_MIN = 60;
/** Widest a named target's name runs beside the diagonal. */
const MARK_MAX = 240;
/** Rough width of one character of those names, and of the count after them. */
const MARK_CHAR = 6.2;
const MARK_COUNT = 24;
/** Most characters of a target's line a name shows. */
export const MARK_TEXT = 64;

/** The pairs a side is made of: strong links for what works well, potential
 *  misalignments for where to look closer. */
export function sideLevel(side: HubTone): AlignmentLevel {
  return side === "apart" ? "flagged" : "high";
}

/** The targets a side names on the map: its headline's, when they are few
 *  enough to name; otherwise the first of the side's list. */
export function namedTargets(data: BriefData, side: HubTone): string[] {
  const c = side === "apart" ? data.concentration : data.strongConcentration;
  if (c.concentrated && c.top.length > 0 && c.top.length <= NAMED_MAX) return c.top;
  const list =
    side === "apart" ? data.commitments.map((r) => r.commitment.id) : data.strongest.map((r) => r.commitment.id);
  return list.slice(0, HUB_TOP);
}

export interface HubParticle {
  /** Index into DOT_ORDER. */
  tone: number;
  /** The two documents of the target pair. */
  a: string;
  b: string;
  /** The two targets of the pair. */
  ca: string;
  cb: string;
  level: AlignmentLevel;
  mechanism: AlignmentMechanism | null;
}

export interface HubGroup {
  key: string;
  count: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Around the document in focus: the side of it the group sits on. */
  side?: "left" | "right";
  /** Where the group's label goes: above it (default), or nowhere (the
   *  map's blocks are named by their documents on its edges). */
  labelAt?: "above" | "none";
  /** On the map: the documents whose targets are the block's rows (the later
   *  one) and its columns (the earlier one). */
  row?: string;
  column?: string;
}

/** A stretch of line on the field. */
export interface HubSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A document's name on an edge of the map, beside its colour bar: a row's
 *  at the left edge (right-aligned at `labelX`, centred on `labelY`), a
 *  column's under the map (centred on `labelX`, its top at `labelY`). */
export interface HubAxis {
  key: string;
  edge: "row" | "column";
  /** The colour bar along the edge: a row's left of its band, a column's under it. */
  bar: HubSegment;
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  /** A thin line from a name that moved away (a row's), or dropped to a
   *  second row (a column's), to its bar. */
  lead: HubSegment | null;
}

/** A target on the map: its row (its pairs with earlier documents, from the
 *  left edge to where its document's row ends) and its column (with later
 *  documents, from where its document's column starts to the bottom edge).
 *  The first document has no row, the last no column. */
export interface HubLines {
  row: { y: number; x0: number; x1: number } | null;
  column: { x: number; y0: number; y1: number } | null;
}

/** A target the map names, and its name centred on `labelY`: left-aligned at
 *  `labelX` above the map or in its empty half, or right-aligned there at
 *  the left edge. */
export interface HubMark {
  id: string;
  doc: string;
  /** Its pairs on the side shown. */
  count: number;
  /** Where its lead ends: its column's top above the map, its row's end in
   *  the empty half, or its row's start at the left edge. */
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
  align: "left" | "right";
  lines: 1 | 2;
}

export interface HubLayout {
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  /** 1 where the particle is shown in this stage. */
  visible: Uint8Array;
  /** How far forward each shown dot is: 1, MAP_MID, MAP_BACK or MAP_FAINT. */
  alpha: Float32Array;
  /** Index into HUB_INK. */
  ink: Uint8Array;
  /** 1 where the dot is drawn small (the checker texture of potential misalignment). */
  small: Uint8Array;
  groups: HubGroup[];
  /** The map's document names: the rows', then the columns', each in
   *  document order. */
  axis: HubAxis[];
  /** The targets the map names, in document order. */
  marks: HubMark[];
  /** Each target's row and column on the map (empty off the map). */
  lines: Map<string, HubLines>;
  /** The map's edges: the rows' bars, the columns' bars, and the gap
   *  between blocks (null off the map). */
  edges: { rowBar: number; columnBar: number; gap: number } | null;
  /** The map's cell: each pair is a square this wide (0 off the map). */
  pitch: number;
  /** The document in focus: its place and the half-width kept for its
   *  name. */
  center: { x: number; y: number; half: number } | null;
  /** Room above each cluster for its name, around the document in focus. */
  focusLabel: number;
}

/** Aligned, partially aligned, potential misalignment, no clear relationship. */
export const HUB_INK = ["#2a7443", "#a9b3a4", "#d2432c", "#cfcfc9"];

/** A pair of the step's tone that is not the one asked about (exact in
 *  a Float32Array, like the other levels). */
export const MAP_MID = 0.5;
/** A pair of the tone outside the theme, type or document the reader
 *  points at: further back, so what they point at stands out. */
export const MAP_BACK = 0.25;
/** A pair outside the step's question: kept for the shape of the map. */
export const MAP_FAINT = 0.125;

/** Room above the overview's groups for their labels. */
const LABEL_BAND = 30;
/** Room above each cluster around a document in focus, for the other
 *  document's name (two lines) and its shares. */
export const FOCUS_LABEL = 74;
/** Room between the name in focus and the clusters, for the spokes. */
const SPOKE = 34;
/** A step with fewer pairs may draw its dots larger, up to this factor of
 *  the overview's size, so the same dots stay recognisable between steps. */
export const ZOOM = 1.8;
/** The smallest dot pitch around a document; below it a dot stands for several pairs. */
const MIN_PITCH = 1.2;
/** Line height of a document's name on the map (0.8125rem type). */
const AXIS_LINE = 16;
/** Most lines a document's name takes on the map. */
const AXIS_LINES = 3;
/** Rough width of one character of those names, for wrapping. */
const AXIS_CHAR = 6.6;
/** A name this wide keeps one line; longer ones wrap, never narrower. */
const AXIS_SHORT = 100;
/** How far a document's colour bar stands from the map's edge. */
const BAR_OFFSET = 7;
/** Room between a row's name and the map (the bar stands in it). */
const ROW_NAME_GAP = 14;
/** Widest a row's name runs, in up to three lines. */
const ROW_NAME_MAX = 150;
/** A column's name: per character of its short name (0.78rem semibold)
 *  and of its context (0.69rem), its line height, the room above it and
 *  between its two rows. */
const COLUMN_CHAR = 6.4;
const CONTEXT_CHAR = 5.3;
const COLUMN_LINE = 15;
const COLUMN_TOP = 13;
const COLUMN_ROW_GAP = 6;
/** Room between a row's end and a target named there. */
const STAIR_GAP = 10;

/** The two documents of a pair key ("A<->B"), in the documents' own order,
 *  so a pair reads the same way in tips, panels and headlines. */
export function pairInOrder(key: string, docs: { id: string }[]): [string, string] {
  const [a, b] = key.split("<->");
  const ia = docs.findIndex((d) => d.id === a);
  const ib = docs.findIndex((d) => d.id === b);
  return ib >= 0 && (ia < 0 || ib < ia) ? [b, a] : [a, b];
}

export function hubParticles(data: BriefData): HubParticle[] {
  return data.scope.comparisons.map((c) => ({
    tone: DOT_ORDER.indexOf(toneOf(c.level)),
    a: c.a.doc,
    b: c.b.doc,
    ca: c.a.id,
    cb: c.b.id,
    level: c.level,
    mechanism: c.mechanism ?? null,
  }));
}

function emptyLayout(n: number): HubLayout {
  return {
    x: new Float32Array(n),
    y: new Float32Array(n),
    r: new Float32Array(n),
    visible: new Uint8Array(n),
    alpha: new Float32Array(n),
    ink: new Uint8Array(n),
    small: new Uint8Array(n),
    groups: [],
    axis: [],
    marks: [],
    lines: new Map(),
    edges: null,
    pitch: 0,
    center: null,
    focusLabel: FOCUS_LABEL,
  };
}

/** The dot pitch of the overview at this size: every pair, by rating. */
function overviewPitch(particles: HubParticle[], width: number, height: number): number {
  const counts = DOT_ORDER.map((_, t) => ({ count: particles.filter((p) => p.tone === t).length }));
  return layoutGroups(counts, 1, width, Math.max(1, height - LABEL_BAND)).pitch;
}

/** The overview: the four ratings side by side, like the landing field. */
function placeGroups(
  layout: HubLayout,
  members: { key: string; ids: number[]; ink: (i: number) => number; texture: boolean }[],
  width: number,
  height: number,
) {
  const present = members.filter((m) => m.ids.length > 0);
  const specs = present.map((m) => ({ count: m.ids.length, texture: m.texture }));
  const grid = layoutGroups(specs, 1, width, Math.max(1, height - LABEL_BAND));
  let di = 0;
  grid.groups.forEach((g) => {
    const m = present[g.index];
    for (const id of m.ids) {
      layout.x[id] = grid.xs[di];
      layout.y[id] = grid.ys[di] + LABEL_BAND;
      layout.r[id] = grid.radius;
      layout.visible[id] = 1;
      layout.alpha[id] = 1;
      layout.ink[id] = m.ink(id);
      layout.small[id] = grid.small[di];
      di += 1;
    }
    layout.groups.push({ key: m.key, count: m.ids.length, x0: g.x0, x1: g.x1, y0: LABEL_BAND, y1: height });
  });
}

function dot(layout: HubLayout, id: number, x: number, y: number, pitch: number, ink: number, small: boolean) {
  layout.x[id] = x;
  layout.y[id] = y;
  layout.r[id] = Math.max(0.55, pitch * 0.34);
  layout.visible[id] = 1;
  layout.alpha[id] = 1;
  layout.ink[id] = ink;
  layout.small[id] = small ? 1 : 0;
}

/** Names moved apart where they would overlap, then back inside the field. */
export function spread(centres: number[], heights: number[], top: number, bottom: number): number[] {
  const y = [...centres];
  // The first name is held inside the field before the others follow: a
  // first name whose own place lies near the top no longer counts as a
  // field too short for all of them.
  if (y.length > 0) y[0] = Math.max(y[0], top + heights[0] / 2);
  for (let k = 1; k < y.length; k++) {
    const min = y[k - 1] + (heights[k - 1] + heights[k]) / 2;
    if (y[k] < min) y[k] = min;
  }
  const last = y.length - 1;
  if (last >= 0 && y[last] + heights[last] / 2 > bottom) y[last] = bottom - heights[last] / 2;
  for (let k = last - 1; k >= 0; k--) {
    const max = y[k + 1] - (heights[k + 1] + heights[k]) / 2;
    if (y[k] > max) y[k] = max;
  }
  if (y.length > 0 && y[0] - heights[0] / 2 < top - 1e-6) {
    // Too many names for the height: they share it evenly.
    const total = heights.reduce((s, h) => s + h, 0);
    const scale = Math.min(1, (bottom - top) / Math.max(1, total));
    let at = top;
    for (let k = 0; k < y.length; k++) {
      heights[k] *= scale;
      y[k] = at + heights[k] / 2;
      at += heights[k];
    }
  }
  return y;
}

/** How many of a side's pairs each target is in. */
function sideCounts(particles: HubParticle[], side: HubTone): Map<string, number> {
  const level = sideLevel(side);
  const count = new Map<string, number>();
  for (const p of particles) {
    if (p.level !== level) continue;
    count.set(p.ca, (count.get(p.ca) ?? 0) + 1);
    count.set(p.cb, (count.get(p.cb) ?? 0) + 1);
  }
  return count;
}

/**
 * The map of documents, named on its edges (round 13): a lower triangle.
 * Each document but the first is a row, named at the left edge; each but the
 * last is a column, named under the map (a short name over a line of
 * context). For two documents, the earlier one's targets are columns and the
 * later one's rows, so each pair of documents is a block and each target pair
 * a square at its two targets.
 *
 * On a side, only that side's pairs are shown, and each document's targets
 * are re-sorted: the ones the side names first, then by how many of the
 * side's pairs they are in, then document order. The side's pairs gather in
 * the corner of their blocks. Its targets are named above the map (the first
 * document's), in the empty half where their row ends (the others), or under
 * their row's name (the last document's). The map keeps its place and size
 * on every side.
 */
function placeMap(
  layout: HubLayout,
  particles: HubParticle[],
  data: BriefData,
  width: number,
  height: number,
  side: HubTone | null,
  extra: string | null,
  count: Map<string, number> = new Map(),
) {
  const docs = data.scope.docs;
  const docIndex = new Map(docs.map((d, i) => [d.id, i]));
  const level = side ? sideLevel(side) : null;
  const has = (id: string) => (count.get(id) ?? 0) > 0;
  const named = side ? namedTargets(data, side).filter(has) : [];
  const rank = new Map(named.map((id, i) => [id, i]));
  const byDoc: string[][] = docs.map(() => []);
  for (const c of data.scope.commitments) {
    const d = docIndex.get(c.doc);
    if (d !== undefined) byDoc[d].push(c.id);
  }
  if (side) {
    const order = new Map(data.scope.commitments.map((c, i) => [c.id, i]));
    const by = (id: string) => rank.get(id) ?? Infinity;
    for (const list of byDoc) {
      list.sort(
        (x, y) =>
          by(x) - by(y) || (count.get(y) ?? 0) - (count.get(x) ?? 0) || (order.get(x) ?? 0) - (order.get(y) ?? 0),
      );
    }
  }
  const sizes = byDoc.map((list) => list.length);
  const rowOf = new Map<string, number>();
  byDoc.forEach((list) => list.forEach((id, i) => rowOf.set(id, i)));
  // Rows are every document but the first, columns every document but the
  // last (a document without targets has neither): every row starts at the
  // left edge, every column ends at the bottom edge.
  const present = docs.map((_, k) => k).filter((k) => sizes[k] > 0);
  if (present.length < 2) return;
  const rows = present.slice(1);
  const cols = present.slice(0, -1);
  const k0 = present[0];
  const last = present[present.length - 1];
  const pad = 6;
  const marked = side ? [...named, ...(extra && !rank.has(extra) && has(extra) ? [extra] : [])] : [];
  const byId = new Map(data.scope.commitments.map((c) => [c.id, c]));
  const ownMarks = (k: number) =>
    marked
      .filter((id) => byId.get(id)?.doc === docs[k].id)
      .sort((a, b) => (rowOf.get(a) ?? 0) - (rowOf.get(b) ?? 0));
  const markWidth = (id: string) => {
    const c = byId.get(id);
    return (c ? targetLine(c, MARK_TEXT).length : 0) * MARK_CHAR + MARK_COUNT;
  };
  // The rows' names: up to three lines at the left, never wider than a
  // third of the field.
  const need = (k: number) => {
    const whole = docs[k].name.length * AXIS_CHAR;
    if (whole <= AXIS_SHORT) return whole;
    const word = Math.max(...docs[k].name.split(/\s+/).map((w) => w.length)) * AXIS_CHAR;
    return Math.min(whole, Math.max(AXIS_SHORT, whole / AXIS_LINES, word));
  };
  const nameWidth = Math.min(ROW_NAME_MAX, width * 0.3, Math.max(40, ...rows.map(need)));
  const x0Min = pad + nameWidth + ROW_NAME_GAP;
  // The first document is a column only: its named targets stand above the
  // map. Their room is the same on every side, so the map keeps its place
  // and size: as many lines as either side names there, at least one (for a
  // target in focus), never more than a fifth of the field.
  const firstOn = (s: HubTone) => {
    const c = sideCounts(particles, s);
    return namedTargets(data, s).filter((id) => (c.get(id) ?? 0) > 0 && byId.get(id)?.doc === docs[k0].id).length;
  };
  const cap = Math.max(1, Math.floor((height * 0.2) / MARK_LINE));
  const aboveLines = Math.min(cap, Math.max(1, firstOn("reinforce"), firstOn("apart")));
  const top = pad + aboveLines * MARK_LINE + 6;
  let first = ownMarks(k0);
  if (first.length > aboveLines) {
    // The most carrying keep their line, and always the target in focus.
    const kept = new Set(
      [...(extra && first.includes(extra) ? [extra] : []), ...first.filter((id) => id !== extra)].slice(0, aboveLines),
    );
    first = first.filter((id) => kept.has(id));
  }
  // The columns' names: a short name over a line of context.
  const colLabel = (k: number): [string, string] => docs[k].mapLabel ?? [docs[k].code || docs[k].id, ""];
  const colWidth = (k: number) => {
    const [name, context] = colLabel(k);
    return Math.max(name.length * COLUMN_CHAR, context.length * CONTEXT_CHAR) + 4;
  };
  const colHeight = (k: number) => (colLabel(k)[1] ? 2 : 1) * COLUMN_LINE;
  const labelH = Math.max(...cols.map(colHeight));
  const below = (n: number) => COLUMN_TOP + n * labelH + (n - 1) * COLUMN_ROW_GAP + pad;
  const colsN = cols.reduce((s, k) => s + sizes[k], 0);
  const rowsN = rows.reduce((s, k) => s + sizes[k], 0);
  const geometry = (room: number) => {
    const availW = width - x0Min - pad;
    const availH = height - top - room;
    const edge = Math.max(40, Math.min(availW, availH));
    const gap = present.length > 2 ? Math.min(6, Math.max(2, edge * 0.012)) : 0;
    const pitch = Math.max(
      0.05,
      Math.min((availW - (cols.length - 1) * gap) / colsN, (availH - (rows.length - 1) * gap) / rowsN),
    );
    const mapW = colsN * pitch + (cols.length - 1) * gap;
    const mapH = rowsN * pitch + (rows.length - 1) * gap;
    const x0 = x0Min + Math.max(0, (availW - mapW) / 2);
    const y0 = top + Math.max(0, (availH - mapH) / 2);
    const colX = new Map<number, number>();
    let at = x0;
    for (const k of cols) {
      colX.set(k, at);
      at += sizes[k] * pitch + gap;
    }
    const rowY = new Map<number, number>();
    at = y0;
    for (const k of rows) {
      rowY.set(k, at);
      at += sizes[k] * pitch + gap;
    }
    return { gap, pitch, x0, y0, colX, rowY, bottom: y0 + mapH };
  };
  let geo = geometry(below(1));
  const centresOf = (g: typeof geo) => cols.map((k) => g.colX.get(k)! + (sizes[k] * g.pitch) / 2);
  // One baseline when the names fit side by side, else two rows.
  const fits = (c: number[]) =>
    cols.every((k, n) => n === 0 || c[n - 1] + colWidth(cols[n - 1]) / 2 + 8 <= c[n] - colWidth(k) / 2) &&
    c[c.length - 1] + colWidth(cols[cols.length - 1]) / 2 <= width - pad;
  const twoRows = !fits(centresOf(geo));
  if (twoRows) geo = geometry(below(2));
  const { gap, pitch, x0, y0, colX, rowY, bottom } = geo;
  layout.pitch = pitch;
  layout.edges = { rowBar: x0 - BAR_OFFSET, columnBar: bottom + BAR_OFFSET, gap };
  const before = (k: number) => present[present.indexOf(k) - 1];
  const after = (k: number) => present[present.indexOf(k) + 1];
  const rowEnd = (k: number) => colX.get(before(k))! + sizes[before(k)] * pitch;
  for (const k of present) {
    byDoc[k].forEach((id, i) => {
      const at = i * pitch + pitch / 2;
      layout.lines.set(id, {
        row: rowY.has(k) ? { y: rowY.get(k)! + at, x0, x1: rowEnd(k) } : null,
        column: colX.has(k) ? { x: colX.get(k)! + at, y0: rowY.get(after(k))!, y1: bottom } : null,
      });
    });
  }
  // Each pair fills its cell at its two targets: the earlier document's in
  // columns, the later one's in rows.
  const radius = pitch / 2;
  const counts = new Map<string, number>();
  particles.forEach((p, i) => {
    let da = docIndex.get(p.a);
    let db = docIndex.get(p.b);
    let ra = rowOf.get(p.ca);
    let rb = rowOf.get(p.cb);
    if (da === undefined || db === undefined || ra === undefined || rb === undefined || da === db) return;
    if (da > db) {
      [da, db] = [db, da];
      [ra, rb] = [rb, ra];
    }
    const cx = colX.get(da);
    const ry = rowY.get(db);
    if (cx === undefined || ry === undefined) return;
    layout.x[i] = cx + ra * pitch + pitch / 2;
    layout.y[i] = ry + rb * pitch + pitch / 2;
    layout.r[i] = radius;
    layout.visible[i] = level === null || p.level === level ? 1 : 0;
    layout.alpha[i] = 1;
    layout.ink[i] = p.tone;
    layout.small[i] = 0;
    const key = `${da}:${db}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  // A square for every pair of documents compared, whatever the side shows.
  for (const i of cols) {
    for (const j of rows) {
      if (j <= i) continue;
      const n = counts.get(`${i}:${j}`) ?? 0;
      if (n === 0) continue;
      layout.groups.push({
        key: getDocPairKey(docs[i].id, docs[j].id),
        count: n,
        x0: colX.get(i)!,
        y0: rowY.get(j)!,
        x1: colX.get(i)! + sizes[i] * pitch,
        y1: rowY.get(j)! + sizes[j] * pitch,
        labelAt: "none",
        row: docs[j].id,
        column: docs[i].id,
      });
    }
  }
  const mark = (
    id: string,
    k: number,
    labelX: number,
    labelY: number,
    labelWidth: number,
    align: "left" | "right",
    lines: 1 | 2,
    end: { x: number; y: number },
  ) => {
    layout.marks.push({
      id,
      doc: docs[k].id,
      count: count.get(id) ?? 0,
      x: end.x,
      y: end.y,
      labelX,
      labelY,
      labelWidth,
      labelHeight: lines === 2 ? 2 * MARK_LINE - 2 : MARK_LINE,
      align,
      lines,
    });
  };
  // Rows: each document's name at the left edge, at the front of its band
  // on a side, else its middle; the last document, which has no column,
  // keeps its named targets under its name. Where the field is too short,
  // those names take one line, then the ones carrying least go unnamed
  // (never the one in focus).
  type Item = { k: number; mark: string | null; height: number; want: number; lines: 1 | 2 };
  const items: Item[] = [];
  for (const k of rows) {
    const lines = Math.min(AXIS_LINES, Math.max(1, Math.ceil((docs[k].name.length * AXIS_CHAR) / nameWidth)));
    const h = lines * AXIS_LINE;
    const band = sizes[k] * pitch;
    items.push({ k, mark: null, height: h, want: side ? rowY.get(k)! + h / 2 : rowY.get(k)! + band / 2, lines: 1 });
    if (k !== last) continue;
    for (const id of ownMarks(k)) {
      const two = markWidth(id) > nameWidth + 30 ? 2 : 1;
      items.push({
        k,
        mark: id,
        height: two === 2 ? 2 * MARK_LINE - 2 : MARK_LINE,
        want: rowY.get(k)! + (rowOf.get(id) ?? 0) * pitch + pitch / 2,
        lines: two,
      });
    }
  }
  const place = () => {
    const hs = items.map((it) => it.height);
    return { cs: spread(items.map((it) => it.want), hs, 0, height), hs };
  };
  const squeezed = ({ hs }: { cs: number[]; hs: number[] }) => hs.some((h, i) => h < items[i].height - 1e-6);
  let placed = place();
  if (squeezed(placed)) {
    for (const it of items) {
      if (it.mark === null || it.lines === 1) continue;
      it.lines = 1;
      it.height = MARK_LINE;
    }
    placed = place();
  }
  const leftDrop = [...ownMarks(last)].reverse().filter((id) => id !== extra);
  while (squeezed(placed) && leftDrop.length > 0) {
    const id = leftDrop.shift();
    const at = items.findIndex((it) => it.mark === id);
    if (at >= 0) items.splice(at, 1);
    placed = place();
  }
  items.forEach((it, n) => {
    const y = placed.cs[n];
    const k = it.k;
    const bandY = rowY.get(k)!;
    if (it.mark === null) {
      const at = side ? pitch / 2 : (sizes[k] * pitch) / 2;
      layout.axis.push({
        key: docs[k].id,
        edge: "row",
        bar: { x0: x0 - BAR_OFFSET, y0: bandY, x1: x0 - BAR_OFFSET, y1: bandY + sizes[k] * pitch },
        labelX: x0 - ROW_NAME_GAP,
        labelY: y,
        labelWidth: nameWidth,
        labelHeight: placed.hs[n],
        lead:
          Math.abs(y - it.want) > 6
            ? { x0: x0 - ROW_NAME_GAP + 3, y0: y, x1: x0 - BAR_OFFSET - 2, y1: bandY + at }
            : null,
      });
      return;
    }
    mark(it.mark, k, x0 - ROW_NAME_GAP, y, nameWidth + 30, "right", it.lines, {
      x: x0 - 1,
      y: bandY + (rowOf.get(it.mark) ?? 0) * pitch + pitch / 2,
    });
    // A name squeezed by a crowded field keeps the height it was given.
    layout.marks[layout.marks.length - 1].labelHeight = placed.hs[n];
  });
  // Columns: a short name over a line of context under each column, on one
  // baseline; where they do not fit side by side, every second one drops a
  // row and a thin line joins it to its bar. A name in the first row keeps
  // clear of its neighbours' lines.
  const centres = centresOf(geo);
  const barY = bottom + BAR_OFFSET;
  cols.forEach((k, n) => {
    const lower = twoRows && n % 2 === 1;
    const c = centres[n];
    // The stretch a name may take: the field, and in two rows the room
    // between its neighbours' lines (first row) or halfway to the next
    // names of its own row (second row).
    let lo = pad;
    let hi = width - pad;
    if (twoRows && lower) {
      if (n - 2 >= 0) lo = Math.max(lo, (centres[n - 2] + c) / 2 + 6);
      if (n + 2 < centres.length) hi = Math.min(hi, (c + centres[n + 2]) / 2 - 6);
    } else if (twoRows) {
      if (n - 1 >= 0) lo = Math.max(lo, centres[n - 1] + 7);
      if (n + 1 < centres.length) hi = Math.min(hi, centres[n + 1] - 7);
    }
    const w = Math.max(0, Math.min(colWidth(k), hi - lo));
    const cx = Math.min(hi - w / 2, Math.max(lo + w / 2, c));
    const labelY = bottom + COLUMN_TOP + (lower ? labelH + COLUMN_ROW_GAP : 0);
    layout.axis.push({
      key: docs[k].id,
      edge: "column",
      bar: { x0: colX.get(k)!, y0: barY, x1: colX.get(k)! + sizes[k] * pitch, y1: barY },
      labelX: cx,
      labelY,
      labelWidth: w,
      labelHeight: colHeight(k),
      lead: lower || Math.abs(cx - c) > 2 ? { x0: c, y0: barY + 2, x1: cx, y1: labelY - 3 } : null,
    });
  });
  // The first document's named targets above the map, at the front of its column.
  first.forEach((id, i) => {
    const labelY = y0 - 6 - (first.length - 1 - i) * MARK_LINE - MARK_LINE / 2;
    mark(id, k0, colX.get(k0)!, labelY, Math.max(MARK_MIN, width - pad - colX.get(k0)!), "left", 1, {
      x: colX.get(k0)! + (rowOf.get(id) ?? 0) * pitch + pitch / 2,
      y: y0 - 1,
    });
  });
  // The middle documents' named targets in the empty half, where their row
  // ends: spread apart above the last row, stepping right where a lower row
  // runs further; where they do not fit, the ones carrying least go unnamed
  // (never the one in focus).
  let stair = present
    .slice(1, -1)
    .flatMap((k) => ownMarks(k).map((id) => ({ id, k, want: rowY.get(k)! + (rowOf.get(id) ?? 0) * pitch + pitch / 2 })));
  const floor = rowY.get(last)! - 2;
  const fitStair = () => {
    const hs = stair.map(() => MARK_LINE);
    return { cs: spread(stair.map((s) => s.want), hs, y0, floor), hs };
  };
  let sp = fitStair();
  const stairDrop = stair
    .map((s) => s.id)
    .filter((id) => id !== extra)
    .sort((a, b) => (rank.get(b) ?? -1) - (rank.get(a) ?? -1));
  while (sp.hs.some((h) => h < MARK_LINE - 1e-6) && stairDrop.length > 0) {
    const id = stairDrop.shift();
    stair = stair.filter((s) => s.id !== id);
    sp = fitStair();
  }
  const bands = rows.map((k) => ({ y0: rowY.get(k)!, y1: rowY.get(k)! + sizes[k] * pitch, end: rowEnd(k) }));
  stair.forEach((s, n) => {
    const y = sp.cs[n];
    const lo = y - MARK_LINE / 2;
    const hi = y + MARK_LINE / 2;
    const end = Math.max(rowEnd(s.k), ...bands.filter((b) => b.y0 < hi + gap && b.y1 > lo - gap).map((b) => b.end));
    const x = end + STAIR_GAP;
    mark(s.id, s.k, x, y, Math.max(MARK_MIN, width - pad - x), "left", 1, { x: rowEnd(s.k) + 1, y: s.want });
  });
  layout.marks.sort((a, b) => docIndex.get(a.doc)! - docIndex.get(b.doc)! || a.y - b.y);
}

/** Whether a pair takes part in what a side's map is asked (null: all do). */
function sideAsked(side: HubTone, focus: MapFocus | undefined, data: BriefData): ((p: HubParticle) => boolean) | null {
  if (!focus) return null;
  switch (focus.kind) {
    case "doc":
      return (p) => p.a === focus.doc || p.b === focus.doc;
    case "target":
      return (p) => p.ca === focus.id || p.cb === focus.id;
    case "mechanism":
      return (p) => p.mechanism === focus.mechanism;
    case "theme": {
      const rows = (side === "apart" ? data.apart : data.together).rows.slice(0, MAX_THEMES);
      const row = rows[focus.index];
      if (!row) return null;
      const keys = getStorylineDocPairKeys(row.storyline);
      return (p) => keys.has(getDocPairKey(p.a, p.b));
    }
    default: {
      // The targets that carry the side, when they are few.
      const c = side === "apart" ? data.concentration : data.strongConcentration;
      if (!c.concentrated) return null;
      const top = new Set(c.top);
      return (p) => top.has(p.ca) || top.has(p.cb);
    }
  }
}

function emphasize(layout: HubLayout, particles: HubParticle[], stage: Extract<HubStage, { kind: "map" }>, data: BriefData) {
  const focus = stage.focus;
  if (stage.side) {
    const asked = sideAsked(stage.side, focus, data);
    if (!asked) return;
    // The side's own finding keeps the rest of the side in view; what the
    // reader points at sets it further back.
    const rest = focus?.kind === "top" ? MAP_MID : MAP_BACK;
    particles.forEach((p, i) => {
      if (layout.visible[i]) layout.alpha[i] = asked(p) ? 1 : rest;
    });
    return;
  }
  // The whole map: a document's row and column, or one rating, forward.
  const tone = stage.tone ? DOT_ORDER.indexOf(stage.tone) : -1;
  const asked =
    focus?.kind === "doc"
      ? (p: HubParticle) => p.a === focus.doc || p.b === focus.doc
      : tone >= 0
        ? (p: HubParticle) => p.tone === tone
        : null;
  if (!asked) return;
  particles.forEach((p, i) => {
    if (layout.visible[i]) layout.alpha[i] = asked(p) ? 1 : MAP_FAINT;
  });
}

/** Most placements kept per selection: a few sizes, both sides, a target
 *  in focus that needs its own name. */
const PLACEMENTS = 8;

interface Placements {
  counts: Partial<Record<HubTone, Map<string, number>>>;
  /** Most recently used last. */
  entries: Map<string, HubLayout>;
}

/** Map placements by data and particles: pointing at a theme, a type, a
 *  document or a named target only changes how far forward dots are. */
const placements = new WeakMap<BriefData, WeakMap<HubParticle[], Placements>>();

function placementsOf(particles: HubParticle[], data: BriefData): Placements {
  let byParticles = placements.get(data);
  if (!byParticles) {
    byParticles = new WeakMap();
    placements.set(data, byParticles);
  }
  let store = byParticles.get(particles);
  if (!store) {
    store = { counts: {}, entries: new Map() };
    byParticles.set(particles, store);
  }
  return store;
}

function placedMap(
  particles: HubParticle[],
  data: BriefData,
  width: number,
  height: number,
  side: HubTone | null,
  focus: string | null,
): HubLayout {
  const store = placementsOf(particles, data);
  let count: Map<string, number> | undefined;
  if (side) {
    count = store.counts[side] ?? sideCounts(particles, side);
    store.counts[side] = count;
  }
  const get = (extra: string | null) => {
    const key = `${width}x${height}:${side ?? ""}:${extra ?? ""}`;
    const hit = store.entries.get(key);
    if (hit) {
      store.entries.delete(key);
      store.entries.set(key, hit);
      return hit;
    }
    const layout = emptyLayout(particles.length);
    placeMap(layout, particles, data, width, height, side, extra, count);
    store.entries.set(key, layout);
    if (store.entries.size > PLACEMENTS) {
      const oldest = store.entries.keys().next().value;
      if (oldest !== undefined) store.entries.delete(oldest);
    }
    return layout;
  };
  const rest = get(null);
  // A target in focus has its own placement only when it adds a name.
  if (!side || !focus || !count || (count.get(focus) ?? 0) === 0 || rest.marks.some((m) => m.id === focus)) return rest;
  return get(focus);
}

export function layoutHub(
  stage: HubStage,
  particles: HubParticle[],
  data: BriefData,
  width: number,
  height: number,
): HubLayout {
  const layout = emptyLayout(particles.length);
  if (width <= 0 || height <= 0) return layout;
  if (stage.kind === "overview") {
    placeGroups(
      layout,
      DOT_ORDER.map((tone, t) => ({
        key: tone,
        ids: particles.flatMap((p, i) => (p.tone === t ? [i] : [])),
        ink: () => t,
        texture: tone === "apart",
      })),
      width,
      height,
    );
  } else if (stage.kind === "map") {
    const extra = stage.side && stage.focus?.kind === "target" ? stage.focus.id : null;
    const base = placedMap(particles, data, width, height, stage.side ?? null, extra);
    // The placement is shared; how far forward each dot is is this stage's own.
    const map = { ...base, alpha: base.alpha.slice() };
    emphasize(map, particles, stage, data);
    return map;
  } else {
    const partners = data.scope.docs.filter((d) => d.id !== stage.doc).map((d) => d.id);
    placeFocus(
      layout,
      particles,
      partners,
      (p, partner) => (p.a === stage.doc && p.b === partner) || (p.b === stage.doc && p.a === partner),
      width,
      height,
      ZOOM * overviewPitch(particles, width, height),
    );
  }
  return layout;
}

/** A target's row and column on the map, each a strip a little wider than
 *  its cells (never under 6px), so the numbers beside it keep clear of its
 *  squares even where a row is under a pixel high. */
export interface HubStrip {
  id: string;
  row: HubLines["row"];
  column: HubLines["column"];
  /** Half the strip's thickness. */
  half: number;
}

const STRIP_MIN_HALF = 3;
const STRIP_PAD = 2;

export function stripOf(layout: HubLayout, id: string): HubStrip | null {
  const lines = layout.lines.get(id);
  if (!lines || (!lines.row && !lines.column)) return null;
  return { id, row: lines.row, column: lines.column, half: Math.max(STRIP_MIN_HALF, layout.pitch / 2 + STRIP_PAD) };
}

/** How many of a target's pairs on the map's side sit in one block, and
 *  where the number goes: under the strip in the middle of the block (its
 *  row: `x` is the number's centre, `y` its top), or beside the strip level
 *  with the block's middle (its column: `y` is the number's middle, `x` its
 *  left edge, or its right edge when it had to go left of the strip). */
export interface HubCount {
  key: string;
  count: number;
  x: number;
  y: number;
  align: "below" | "right" | "left";
}

/** Room between a strip and its numbers. */
const COUNT_GAP = 2;
/** Rough size of a number's label (brief.css: 12px digits with 3px either
 *  side, 14px high), to keep numbers apart and on the map. */
const COUNT_DIGIT = 7;
const COUNT_PAD = 6;
const COUNT_HEIGHT = 14;

function countWidth(count: number): number {
  return String(count).length * COUNT_DIGIT + COUNT_PAD;
}

export function stripCounts(layout: HubLayout, particles: HubParticle[], id: string): HubCount[] {
  const strip = stripOf(layout, id);
  if (!strip) return [];
  const count = new Map<string, number>();
  particles.forEach((p, i) => {
    if (!layout.visible[i] || (p.ca !== id && p.cb !== id)) return;
    const key = getDocPairKey(p.a, p.b);
    count.set(key, (count.get(key) ?? 0) + 1);
  });
  const right = Math.max(...layout.groups.map((g) => g.x1));
  const counts: HubCount[] = [];
  for (const g of layout.groups) {
    const n = count.get(g.key);
    if (!n) continue;
    // The blocks level with its row are on its row; the others on its column.
    if (strip.row && g.y0 <= strip.row.y && strip.row.y <= g.y1) {
      counts.push({ key: g.key, count: n, x: (g.x0 + g.x1) / 2, y: strip.row.y + strip.half + COUNT_GAP, align: "below" });
      continue;
    }
    if (!strip.column) continue;
    // Beside the column, on the side that keeps the number on the map.
    const after = strip.column.x + strip.half + COUNT_GAP;
    const fits = after + countWidth(n) <= right;
    counts.push({
      key: g.key,
      count: n,
      x: fits ? after : strip.column.x - strip.half - COUNT_GAP,
      y: (g.y0 + g.y1) / 2,
      align: fits ? "right" : "left",
    });
  }
  // Where blocks are smaller than their numbers, the numbers move apart
  // along the strip, in order, and stay beside it.
  const row = counts.filter((c) => c.align === "below");
  if (strip.row) {
    const { x0, x1 } = strip.row;
    spread(row.map((c) => c.x), row.map((c) => countWidth(c.count)), x0, x1).forEach((x, k) => (row[k].x = x));
  }
  const column = counts.filter((c) => c.align !== "below");
  if (strip.column) {
    const { y0, y1 } = strip.column;
    spread(column.map((c) => c.y), column.map(() => COUNT_HEIGHT), y0, y1).forEach((y, k) => (column[k].y = y));
  }
  return counts;
}

/** A pointed block traced to its two documents' bars along the white gaps:
 *  from the gap corner above-left of it, left to the rows' bars and down to
 *  the columns' bars, never over a square. */
export function pairGuides(layout: HubLayout, group: HubGroup): HubSegment[] {
  if (!layout.edges || group.row === undefined) return [];
  const half = layout.edges.gap / 2;
  const x = group.x0 - half;
  const y = group.y0 - half;
  return [
    { x0: x, y0: y, x1: layout.edges.rowBar, y1: y },
    { x0: x, y0: y, x1: x, y1: layout.edges.columnBar },
  ];
}

/** Red first, then partial, no clear relationship and aligned: each
 *  cluster reads as bands of its composition. */
const FOCUS_ORDER = [2, 1, 3, 0];
/** Margin around the field and between a cluster and the next name. */
const FOCUS_PAD = 8;
/** Most of a partner's slot its name may take on a short field. */
const FOCUS_LABEL_SHARE = 0.45;

/**
 * A document in the centre and, on either side of it, its target
 * pairs with each other document as a cluster under that document's name:
 * a hub with the pairs themselves as its spokes. Other documents keep their
 * order, filling the left side first; both sides are centred on the middle.
 */
function placeFocus(
  layout: HubLayout,
  particles: HubParticle[],
  partners: string[],
  belongs: (p: HubParticle, partner: string) => boolean,
  width: number,
  height: number,
  maxPitch: number,
) {
  const cx = width / 2;
  const cy = height / 2;
  // The name in focus and its figures take the middle third (at most 12rem).
  const middle = Math.min(width / 3, 192);
  layout.center = { x: cx, y: cy, half: middle / 2 };
  const members = partners.map((partner) =>
    particles
      .flatMap((p, i) => (belongs(p, partner) ? [i] : []))
      .sort((i, j) => FOCUS_ORDER.indexOf(particles[i].tone) - FOCUS_ORDER.indexOf(particles[j].tone) || i - j),
  );
  const left = Math.ceil(partners.length / 2);
  const perSide = Math.max(1, left);
  const columnWidth = Math.max(1, cx - middle / 2 - SPOKE - FOCUS_PAD);
  const slot = (height - FOCUS_PAD) / perSide;
  // Many partners on a short field: the names get less room (one line).
  const band = Math.max(30, Math.min(FOCUS_LABEL, slot * FOCUS_LABEL_SHARE));
  layout.focusLabel = band;
  const boxH = Math.max(1, slot - band - FOCUS_PAD);
  const boxW = Math.max(1, Math.min(columnWidth, boxH * 2.2));
  // Clusters take the shape of the room they have, so the largest fills it.
  const aspect = boxW / boxH;
  const shape = (n: number) => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect)));
    return { cols, rows: Math.ceil(n / cols) };
  };
  const most = Math.max(1, ...members.map((ids) => ids.length));
  // Too many pairs for the room even at the smallest dot: one dot stands
  // for `unit` pairs, taken evenly along each cluster; counts stay exact.
  let unit = 1;
  const fitsAt = (u: number) => {
    const s = shape(Math.ceil(most / u));
    return s.cols * MIN_PITCH <= boxW && s.rows * MIN_PITCH <= boxH;
  };
  while (!fitsAt(unit) && unit < 100000) unit *= 2;
  const largest = shape(Math.ceil(most / unit));
  const pitch = Math.max(MIN_PITCH, Math.min(maxPitch, boxW / largest.cols, boxH / largest.rows));
  const apart = DOT_ORDER.indexOf("apart");
  members.forEach((list, k) => {
    if (list.length === 0) return;
    const onLeft = k < left;
    const count = onLeft ? left : partners.length - left;
    const row = onLeft ? k : k - left;
    // A shorter side is centred on the middle.
    const top = FOCUS_PAD + (perSide - count) * (slot / 2) + row * slot + band;
    const shown = list.filter((_, n) => n % unit === 0);
    const { cols, rows } = shape(shown.length);
    const w = cols * pitch;
    const h = rows * pitch;
    const x0 = onLeft ? cx - middle / 2 - SPOKE - w : cx + middle / 2 + SPOKE;
    shown.forEach((id, n) => {
      const col = n % cols;
      const r = Math.floor(n / cols);
      // The checker texture tells potential misalignment apart without colour.
      dot(layout, id, x0 + col * pitch + pitch / 2, top + r * pitch + pitch / 2, pitch, particles[id].tone,
        particles[id].tone === apart && (col + r) % 2 === 1);
    });
    layout.groups.push({
      key: partners[k],
      count: list.length,
      x0,
      y0: top,
      x1: x0 + w,
      y1: top + h,
      side: onLeft ? "left" : "right",
    });
  });
}
