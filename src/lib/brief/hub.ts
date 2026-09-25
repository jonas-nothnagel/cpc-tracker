import { getDocPairKey, getStorylineDocPairKeys } from "@/lib/coherence-briefing";
import type { AlignmentLevel, AlignmentMechanism } from "@/types";
import { toneOf } from "./compute";
import { MAX_THEMES, type BriefData } from "./data";
import { DOT_ORDER, layoutGroups } from "./dot-layout";

/**
 * The coherence overview on screen: one field of dots, one per target pair,
 * that re-forms for each step of the overview. The same particles move
 * between stages: the ratings side by side, then the map of documents (each
 * dot at its two targets), brought forward for the question of a step, and
 * a target or a document in the centre with its pairs around it.
 */
export type HubTone = "reinforce" | "apart";

/** What the map brings forward within a tone (or across all pairs). */
export type MapFocus =
  /** The fewest targets that take part in half of the tone's pairs (strong
   *  links for alignment), when they are few (see `Concentration`). */
  | { kind: "top" }
  /** A shown theme of the tone: its pairs between the documents it cites. */
  | { kind: "theme"; index: number }
  | { kind: "mechanism"; mechanism: AlignmentMechanism }
  /** A document: its row and column. */
  | { kind: "doc"; doc: string };

export type HubStage =
  | { kind: "overview" }
  | { kind: "map"; tone?: HubTone; focus?: MapFocus }
  | { kind: "target"; id: string }
  | { kind: "doc"; doc: string };

/** Targets each list of the overview shows at least. */
export const HUB_TOP = 6;

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
  /** Around a target or document in focus: the side of it the group sits on. */
  side?: "left" | "right";
  /** Where the group's label goes: above it (default), or nowhere (the
   *  map's blocks are named by their documents on the diagonal). */
  labelAt?: "above" | "none";
}

/** A document on the map's diagonal: its own (empty) square, and its name
 *  to the left of it, right-aligned at `labelX` and centred on `labelY`. */
export interface HubAxis {
  key: string;
  square: { x0: number; y0: number; x1: number; y1: number };
  labelX: number;
  labelY: number;
  labelWidth: number;
  labelHeight: number;
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
  /** The map's documents, in document order. */
  axis: HubAxis[];
  /** The target's or document's place in focus and the half-width kept for
   *  its name. */
  center: { x: number; y: number; half: number } | null;
  /** Room above each cluster for its name, around a target or document. */
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
/** A single target's pairs zoom in further. */
export const ZOOM_DEEP = 2.6;
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
function spread(centres: number[], heights: number[], top: number, bottom: number): number[] {
  const y = [...centres];
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
  if (y.length > 0 && y[0] - heights[0] / 2 < top) {
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

/**
 * The map of documents: the comparison triangle of the method page. Each
 * document's targets run along the diagonal; for two documents, the earlier
 * one's targets are rows and the later one's columns, so each pair of
 * documents is a block and each target pair a dot at its two targets. A
 * document's own square stays empty: it is never compared with itself.
 */
function placeMap(layout: HubLayout, particles: HubParticle[], data: BriefData, width: number, height: number) {
  const docs = data.scope.docs;
  const docIndex = new Map(docs.map((d, i) => [d.id, i]));
  const sizes = docs.map(() => 0);
  const rowOf = new Map<string, number>();
  for (const c of data.scope.commitments) {
    const d = docIndex.get(c.doc);
    if (d === undefined) continue;
    rowOf.set(c.id, sizes[d]);
    sizes[d] += 1;
  }
  const total = sizes.reduce((s, n) => s + n, 0);
  if (total === 0 || docs.length === 0) return;
  const pad = 6;
  // The names use the empty half under the diagonal: each is right-aligned
  // at its own stretch, so only the first documents need room at the left.
  // That room is what the names need in up to three lines, found in two
  // passes (the stretches move with the dot size).
  const need = docs.map((d) => {
    const whole = d.name.length * AXIS_CHAR;
    if (whole <= AXIS_SHORT) return whole;
    const word = Math.max(...d.name.split(/\s+/).map((w) => w.length)) * AXIS_CHAR;
    return Math.min(whole, Math.max(AXIS_SHORT, whole / AXIS_LINES, word));
  });
  const geometry = (room: number) => {
    const side = Math.max(40, Math.min(width - room - 2 * pad, height - 2 * pad));
    const gap = docs.length > 1 ? Math.min(6, Math.max(2, side * 0.012)) : 0;
    const pitch = Math.max(0.05, (side - (docs.length - 1) * gap) / total);
    const off: number[] = [];
    let acc = 0;
    sizes.forEach((n, d) => {
      off.push(acc * pitch + d * gap);
      acc += n;
    });
    return { gap, pitch, off };
  };
  let labelRoom = Math.min(150, Math.max(56, width * 0.2));
  let geo = geometry(labelRoom);
  for (let pass = 0; pass < 4; pass++) {
    const wanted = Math.max(0, ...docs.map((_, k) => (sizes[k] > 0 ? need[k] + 8 - geo.off[k] : 0)));
    const next = Math.min(Math.max(40, width * 0.3), Math.max(40, wanted));
    if (Math.abs(next - labelRoom) < 0.5) break;
    labelRoom = next;
    geo = geometry(labelRoom);
  }
  const { gap, pitch, off } = geo;
  const used = total * pitch + (docs.length - 1) * gap;
  const x0 = Math.max(labelRoom + pad, (width - labelRoom - used) / 2 + labelRoom);
  const y0 = Math.max(pad, (height - used) / 2);
  const radius = Math.max(0.4, pitch * 0.4);
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
    layout.x[i] = x0 + off[db] + rb * pitch + pitch / 2;
    layout.y[i] = y0 + off[da] + ra * pitch + pitch / 2;
    layout.r[i] = radius;
    layout.visible[i] = 1;
    layout.alpha[i] = 1;
    layout.ink[i] = p.tone;
    layout.small[i] = 0;
    const key = `${da}:${db}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const count = counts.get(`${i}:${j}`) ?? 0;
      if (count === 0) continue;
      layout.groups.push({
        key: getDocPairKey(docs[i].id, docs[j].id),
        count,
        x0: x0 + off[j],
        y0: y0 + off[i],
        x1: x0 + off[j] + sizes[j] * pitch,
        y1: y0 + off[i] + sizes[i] * pitch,
        labelAt: "none",
      });
    }
  }
  const shown = docs.flatMap((d, k) => (sizes[k] > 0 ? [k] : []));
  const labelX = shown.map((k) => x0 + off[k] - 8);
  const labelWidth = labelX.map((x) => Math.max(24, Math.min(220, x - pad)));
  const heights = shown.map((k, n) => {
    const chars = docs[k].name.length * AXIS_CHAR;
    return Math.min(AXIS_LINES, Math.max(1, Math.ceil(chars / labelWidth[n]))) * AXIS_LINE;
  });
  const centres = spread(
    shown.map((k) => y0 + off[k] + (sizes[k] * pitch) / 2),
    heights,
    0,
    height,
  );
  shown.forEach((k, n) => {
    layout.axis.push({
      key: docs[k].id,
      square: {
        x0: x0 + off[k],
        y0: y0 + off[k],
        x1: x0 + off[k] + sizes[k] * pitch,
        y1: y0 + off[k] + sizes[k] * pitch,
      },
      labelX: labelX[n],
      labelY: centres[n],
      labelWidth: labelWidth[n],
      labelHeight: heights[n],
    });
  });
}

/** Whether a pair takes part in the question the map is asked. */
function emphasis(
  stage: Extract<HubStage, { kind: "map" }>,
  data: BriefData,
): ((p: HubParticle) => boolean) | null {
  const focus = stage.focus;
  if (!focus) return null;
  if (focus.kind === "doc") return (p) => p.a === focus.doc || p.b === focus.doc;
  if (focus.kind === "mechanism") return (p) => p.level === "flagged" && p.mechanism === focus.mechanism;
  if (focus.kind === "theme") {
    const rows = (stage.tone === "apart" ? data.apart : data.together).rows.slice(0, MAX_THEMES);
    const row = rows[focus.index];
    if (!row) return null;
    const keys = getStorylineDocPairKeys(row.storyline);
    return (p) => keys.has(getDocPairKey(p.a, p.b));
  }
  // The targets that carry the tone, when they are few: their strong links,
  // or their potential misalignments.
  const c = stage.tone === "apart" ? data.concentration : data.strongConcentration;
  if (!stage.tone || !c.concentrated) return null;
  const top = new Set(c.top);
  const level = stage.tone === "apart" ? "flagged" : "high";
  return (p) => p.level === level && (top.has(p.ca) || top.has(p.cb));
}

function emphasize(layout: HubLayout, particles: HubParticle[], stage: Extract<HubStage, { kind: "map" }>, data: BriefData) {
  const tone = stage.tone ? DOT_ORDER.indexOf(stage.tone) : -1;
  const asked = emphasis(stage, data);
  // The step's own finding keeps the rest of its tone in view; what the
  // reader points at sets it further back.
  const rest = tone < 0 ? MAP_FAINT : stage.focus?.kind === "top" ? MAP_MID : MAP_BACK;
  particles.forEach((p, i) => {
    if (!layout.visible[i]) return;
    const inTone = tone < 0 || p.tone === tone;
    if (!inTone) layout.alpha[i] = MAP_FAINT;
    else if (!asked) layout.alpha[i] = 1;
    else if (asked(p)) layout.alpha[i] = 1;
    else layout.alpha[i] = rest;
  });
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
    placeMap(layout, particles, data, width, height);
    emphasize(layout, particles, stage, data);
  } else if (stage.kind === "target") {
    const own = data.scope.commitments.find((c) => c.id === stage.id)?.doc;
    const partners = data.scope.docs.filter((d) => d.id !== own).map((d) => d.id);
    placeFocus(
      layout,
      particles,
      partners,
      (p, partner) => (p.ca === stage.id && p.b === partner) || (p.cb === stage.id && p.a === partner),
      width,
      height,
      ZOOM_DEEP * overviewPitch(particles, width, height),
      // A target's clusters are small (one dot per target of the other
      // document), so its partners' names can have more of each slot.
      0.62,
    );
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

/** Red first, then partial, no clear relationship and aligned: each
 *  cluster reads as bands of its composition. */
const FOCUS_ORDER = [2, 1, 3, 0];
/** Margin around the field and between a cluster and the next name. */
const FOCUS_PAD = 8;

/**
 * A target or document in the centre and, on either side of it, its target
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
  labelShare = 0.45,
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
  const band = Math.max(30, Math.min(FOCUS_LABEL, slot * labelShare));
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
