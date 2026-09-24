import { getDocPairKey, getStorylineDocPairKeys } from "@/lib/coherence-briefing";
import type { AlignmentLevel, AlignmentMechanism } from "@/types";
import { toneOf } from "./compute";
import { MAX_THEMES, OTHER_THEME, type BriefData } from "./data";
import { DOT_ORDER, layoutGroups } from "./dot-layout";

/**
 * The coherence overview on screen: one field of dots, one per target pair,
 * that re-forms for each step of the overview. The same particles move
 * between stages, so a reader sees the aligned pairs of the overview become
 * the aligned themes, then the strongest alignments, or a document's pairs
 * gather around it.
 */
export type HubStage =
  | { kind: "overview" }
  | { kind: "reinforce" }
  | { kind: "strong" }
  | { kind: "apart" }
  | { kind: "kinds" }
  | { kind: "review" }
  | { kind: "doc"; doc: string };

/** Targets each list of the overview shows, and the canvas with it. */
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
  /** The shown theme of its tone that covers it (index), -1 when none. */
  theme: number;
  /** Its place among the top targets of its tone's list (strong links for
   *  aligned pairs, potential misalignments for the others), -1 when none. */
  target: number;
  /** A copy for a second theme covering the pair (themes are coverage), or
   *  for the second top target of a pair between two of them. */
  ghost: false | "theme" | "target";
  /** For a ghost, the particle it splits from; otherwise its own index. */
  base: number;
}

/** One part of a group: a pair of documents within a theme, or a partner
 *  document of a target. */
export interface HubPart {
  key: string;
  count: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface HubGroup {
  key: string;
  count: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Around a document in focus: the side of it the group sits on. */
  side?: "left" | "right";
  /** Where the group's label goes: above it (default) or to its left. */
  labelAt?: "above" | "left";
  parts?: HubPart[];
}

export interface HubLayout {
  x: Float32Array;
  y: Float32Array;
  r: Float32Array;
  /** 1 where the particle is shown in this stage. */
  visible: Uint8Array;
  /** Index into HUB_INK. */
  ink: Uint8Array;
  /** 1 where the dot is drawn small (the checker texture of potential misalignment). */
  small: Uint8Array;
  groups: HubGroup[];
  /** The focus document's place and the half-width kept for its name, in
   *  the document stage. */
  center: { x: number; y: number; half: number } | null;
  /** Room kept at the left for the strips' labels. */
  labelWidth: number;
  /** Room above each cluster for its name, in the document stage. */
  focusLabel: number;
}

/** Aligned, partially aligned, potential misalignment, no clear relationship,
 *  then the lighter inks for pairs outside every theme. */
export const HUB_INK = ["#2a7443", "#a9b3a4", "#d2432c", "#cfcfc9", "#a8cbb2", "#f1b1a4"];

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
/** The steps that single out a few targets zoom in further. */
export const ZOOM_DEEP = 2.6;
/** Rows of dots in one strip of the strongest alignments, types of
 *  potential misalignment and targets to review first. */
const STRIP_ROWS = 4;
/** The smallest dot pitch; below it a dot stands for several pairs. */
const MIN_PITCH = 1.2;

/** The two documents of a pair key ("A<->B"), in the documents' own order,
 *  so a pair reads the same way in tips, panels and headlines. */
export function pairInOrder(key: string, docs: { id: string }[]): [string, string] {
  const [a, b] = key.split("<->");
  const ia = docs.findIndex((d) => d.id === a);
  const ib = docs.findIndex((d) => d.id === b);
  return ib >= 0 && (ia < 0 || ib < ia) ? [b, a] : [a, b];
}

export function hubParticles(data: BriefData): HubParticle[] {
  const shown = (rows: BriefData["together"]["rows"]) =>
    rows.slice(0, MAX_THEMES).map((r) => getStorylineDocPairKeys(r.storyline));
  const keys = { reinforce: shown(data.together.rows), apart: shown(data.apart.rows) };
  const strong = data.strongest.slice(0, HUB_TOP).map((r) => r.commitment.id);
  const review = data.commitments.slice(0, HUB_TOP).map((r) => r.commitment.id);
  const base: HubParticle[] = [];
  const ghosts: HubParticle[] = [];
  data.scope.comparisons.forEach((c, i) => {
    const tone = toneOf(c.level);
    const sets = tone === "reinforce" ? keys.reinforce : tone === "apart" ? keys.apart : [];
    const key = getDocPairKey(c.a.doc, c.b.doc);
    const members = sets.flatMap((set, idx) => (set.has(key) ? [idx] : []));
    // Strong links count toward the strongest alignments; every potential
    // misalignment toward the targets to review first.
    const top = c.level === "high" ? strong : tone === "apart" ? review : [];
    const places = [top.indexOf(c.a.id), top.indexOf(c.b.id)].filter((k) => k >= 0).sort((x, y) => x - y);
    const t = DOT_ORDER.indexOf(tone);
    const common = {
      tone: t,
      a: c.a.doc,
      b: c.b.doc,
      ca: c.a.id,
      cb: c.b.id,
      level: c.level,
      mechanism: c.mechanism ?? null,
      base: i,
    };
    base.push({ ...common, theme: members[0] ?? -1, target: places[0] ?? -1, ghost: false });
    for (const m of members.slice(1)) ghosts.push({ ...common, theme: m, target: -1, ghost: "theme" });
    if (places.length === 2) ghosts.push({ ...common, theme: -1, target: places[1], ghost: "target" });
  });
  return [...base, ...ghosts];
}

function emptyLayout(n: number): HubLayout {
  return {
    x: new Float32Array(n),
    y: new Float32Array(n),
    r: new Float32Array(n),
    visible: new Uint8Array(n),
    ink: new Uint8Array(n),
    small: new Uint8Array(n),
    groups: [],
    center: null,
    labelWidth: 0,
    focusLabel: FOCUS_LABEL,
  };
}

/** The dot pitch of the overview at this size: every pair, by rating. */
function overviewPitch(particles: HubParticle[], width: number, height: number): number {
  const counts = DOT_ORDER.map((_, t) => ({
    count: particles.filter((p) => !p.ghost && p.tone === t).length,
  }));
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
      layout.ink[id] = m.ink(id);
      layout.small[id] = grid.small[di];
      di += 1;
    }
    layout.groups.push({ key: m.key, count: m.ids.length, x0: g.x0, x1: g.x1, y0: LABEL_BAND, y1: height });
  });
}

interface Member {
  key: string;
  /** The group's parts in order, each a list of particle ids. */
  parts: { key: string; ids: number[] }[];
  ink: number;
  texture: boolean;
}

function countOf(m: Member): number {
  return m.parts.reduce((s, p) => s + p.ids.length, 0);
}

/** Split ids into parts by a key, largest first (first seen breaks ties). */
function partsBy(ids: number[], keyOf: (i: number) => string): { key: string; ids: number[] }[] {
  const byKey = new Map<string, number[]>();
  for (const id of ids) {
    const k = keyOf(id);
    const list = byKey.get(k);
    if (list) list.push(id);
    else byKey.set(k, [id]);
  }
  return [...byKey.entries()]
    .map(([key, list]) => ({ key, ids: list }))
    .sort((x, y) => y.ids.length - x.ids.length);
}

function dot(layout: HubLayout, id: number, x: number, y: number, pitch: number, ink: number, small: boolean) {
  layout.x[id] = x;
  layout.y[id] = y;
  layout.r[id] = Math.max(0.55, pitch * 0.34);
  layout.visible[id] = 1;
  layout.ink[id] = ink;
  layout.small[id] = small ? 1 : 0;
}

/**
 * Themes, targets or kinds of potential misalignment as strips one under
 * the other: a label on the left and the dots in a band of rows, one
 * segment per pair of documents or partner document (largest first) with
 * an empty column between segments. Strip lengths are in proportion to
 * their pairs. Ranked targets keep thin strips of four rows, like bars;
 * themes and kinds fill the room with more rows.
 */
function placeStrips(
  layout: HubLayout,
  members: Member[],
  width: number,
  height: number,
  maxPitch: number,
  fill = false,
) {
  const present = members.filter((m) => countOf(m) > 0);
  if (present.length === 0) return;
  const labelWidth = Math.min(width * 0.36, 240);
  layout.labelWidth = labelWidth;
  const x0 = labelWidth + 16;
  const areaW = Math.max(1, width - x0);
  const gapY = Math.min(40, height / (present.length * 3));
  const slotH = Math.max(1, (height - (present.length - 1) * gapY) / present.length);
  const colsFor = (m: Member, rows: number) => {
    const parts = m.parts.filter((p) => p.ids.length > 0);
    return parts.reduce((s, p) => s + Math.ceil(p.ids.length / rows), 0) + parts.length - 1;
  };
  // Themes and kinds fill their slot with rows; ranked targets keep four.
  const rowsAt = (p: number) => Math.max(1, fill ? Math.floor(slotH / p) : Math.min(STRIP_ROWS, Math.floor(slotH / p)));
  let pitch = maxPitch;
  for (let i = 0; i < 600 && pitch > MIN_PITCH; i++) {
    const rows = rowsAt(pitch);
    const widest = Math.max(1, ...present.map((m) => colsFor(m, rows)));
    if (widest * pitch <= areaW && rows * pitch <= slotH) break;
    pitch *= 0.97;
  }
  pitch = Math.max(MIN_PITCH, pitch);
  const rows = rowsAt(pitch);
  // Too many pairs for the room even at the smallest dot: one dot stands
  // for `unit` pairs, taken evenly along each segment; counts stay exact.
  let unit = 1;
  const fits = (u: number) =>
    Math.max(
      1,
      ...present.map((m) => {
        const parts = m.parts.filter((p) => p.ids.length > 0);
        return parts.reduce((sum, p) => sum + Math.ceil(Math.ceil(p.ids.length / u) / rows), 0) + parts.length - 1;
      }),
    ) * pitch <= areaW;
  while (!fits(unit) && unit < 100000) unit *= 2;
  const stripH = rows * pitch;
  const block = present.length * stripH + (present.length - 1) * gapY;
  const top = Math.max(0, (height - block) / 2);
  present.forEach((m, k) => {
    const y0 = top + k * (stripH + gapY);
    let col = 0;
    const parts: HubPart[] = [];
    m.parts.forEach((part) => {
      if (part.ids.length === 0) return;
      const c0 = col;
      const shown = part.ids.filter((_, n) => n % unit === 0);
      shown.forEach((id, n) => {
        const cc = col + Math.floor(n / rows);
        const rr = n % rows;
        dot(layout, id, x0 + cc * pitch + pitch / 2, y0 + rr * pitch + pitch / 2, pitch, m.ink, m.texture && (cc + rr) % 2 === 1);
      });
      col += Math.ceil(shown.length / rows);
      parts.push({ key: part.key, count: part.ids.length, x0: x0 + c0 * pitch, x1: x0 + col * pitch, y0, y1: y0 + stripH });
      col += 1;
    });
    layout.groups.push({
      key: m.key,
      count: countOf(m),
      x0,
      x1: x0 + (col - 1) * pitch,
      y0,
      y1: y0 + stripH,
      labelAt: "left",
      parts,
    });
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
  const ids = (keep: (p: HubParticle) => boolean) =>
    particles.flatMap((p, i) => (keep(p) ? [i] : []));
  const docPair = (i: number) => getDocPairKey(particles[i].a, particles[i].b);
  const apart = DOT_ORDER.indexOf("apart");
  const reinforce = DOT_ORDER.indexOf("reinforce");

  if (stage.kind === "overview") {
    placeGroups(
      layout,
      DOT_ORDER.map((tone, t) => ({
        key: tone,
        ids: ids((p) => !p.ghost && p.tone === t),
        ink: () => t,
        texture: tone === "apart",
      })),
      width,
      height,
    );
  } else if (stage.kind === "reinforce" || stage.kind === "apart") {
    const maxPitch = ZOOM * overviewPitch(particles, width, height);
    const t = DOT_ORDER.indexOf(stage.kind);
    const rows = (stage.kind === "reinforce" ? data.together : data.apart).rows.slice(0, MAX_THEMES);
    // One strip per theme, named at its left, split by the pairs of
    // documents that carry it.
    placeStrips(
      layout,
      [
        ...rows.map((row, idx) => ({
          key: row.storyline.name,
          parts: partsBy(
            ids((p) => p.ghost !== "target" && p.tone === t && p.theme === idx),
            docPair,
          ),
          ink: t,
          texture: stage.kind === "apart",
        })),
        {
          key: OTHER_THEME,
          parts: [{ key: OTHER_THEME, ids: ids((p) => !p.ghost && p.tone === t && p.theme === -1) }],
          ink: stage.kind === "reinforce" ? 4 : 5,
          texture: stage.kind === "apart",
        },
      ],
      width,
      height,
      maxPitch,
      true,
    );
  } else if (stage.kind === "strong" || stage.kind === "review") {
    const maxPitch = ZOOM_DEEP * overviewPitch(particles, width, height);
    const t = stage.kind === "strong" ? reinforce : apart;
    const top =
      stage.kind === "strong"
        ? data.strongest.slice(0, HUB_TOP).map((r) => r.commitment.id)
        : data.commitments.slice(0, HUB_TOP).map((r) => r.commitment.id);
    placeStrips(
      layout,
      top.map((id, k) => ({
        key: id,
        // Segments by the partner's document: the other target of each pair.
        parts: partsBy(
          ids((p) => p.ghost !== "theme" && p.tone === t && p.target === k && (stage.kind !== "strong" || p.level === "high")),
          (i) => (particles[i].ca === id ? particles[i].b : particles[i].a),
        ),
        ink: t,
        texture: stage.kind === "review",
      })),
      width,
      height,
      maxPitch,
    );
  } else if (stage.kind === "kinds") {
    const maxPitch = ZOOM_DEEP * overviewPitch(particles, width, height);
    placeStrips(
      layout,
      data.mix.map((m) => ({
        key: m.mechanism,
        parts: [{ key: m.mechanism, ids: ids((p) => !p.ghost && p.tone === apart && p.mechanism === m.mechanism) }],
        ink: apart,
        texture: true,
      })),
      width,
      height,
      maxPitch,
      true,
    );
  } else {
    placeFocus(layout, particles, data, stage.doc, width, height, ZOOM * overviewPitch(particles, width, height));
  }
  return layout;
}

/** Red first, then partial, no clear relationship and aligned: each
 *  cluster reads as bands of its composition. */
const FOCUS_ORDER = [2, 1, 3, 0];
/** Margin around the field and between a cluster and the next name. */
const FOCUS_PAD = 8;

/**
 * A document in the centre and, on either side of it, its target pairs with
 * each other document as a cluster under that document's name: a hub with
 * the pairs themselves as its spokes. Other documents keep their order,
 * filling the left side first; both sides are centred on the document.
 */
function placeFocus(
  layout: HubLayout,
  particles: HubParticle[],
  data: BriefData,
  doc: string,
  width: number,
  height: number,
  maxPitch: number,
) {
  const partners = data.scope.docs.filter((d) => d.id !== doc);
  const cx = width / 2;
  const cy = height / 2;
  // The document's name and figures take the middle third (at most 12rem).
  const middle = Math.min(width / 3, 192);
  layout.center = { x: cx, y: cy, half: middle / 2 };
  const members = partners.map((partner) =>
    particles
      .flatMap((p, i) =>
        !p.ghost && ((p.a === doc && p.b === partner.id) || (p.b === doc && p.a === partner.id))
          ? [i]
          : [],
      )
      .sort((i, j) => FOCUS_ORDER.indexOf(particles[i].tone) - FOCUS_ORDER.indexOf(particles[j].tone) || i - j),
  );
  const left = Math.ceil(partners.length / 2);
  const perSide = Math.max(1, left);
  const columnWidth = Math.max(1, cx - middle / 2 - SPOKE - FOCUS_PAD);
  const slot = (height - FOCUS_PAD) / perSide;
  // Many partners on a short field: the names get less room (one line).
  const band = Math.max(30, Math.min(FOCUS_LABEL, slot * 0.45));
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
    // A shorter side is centred on the document.
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
      key: partners[k].id,
      count: list.length,
      x0,
      y0: top,
      x1: x0 + w,
      y1: top + h,
      side: onLeft ? "left" : "right",
    });
  });
}
