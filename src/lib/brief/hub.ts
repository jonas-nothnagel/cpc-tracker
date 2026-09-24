import { getDocPairKey, getStorylineDocPairKeys } from "@/lib/coherence-briefing";
import { toneOf } from "./compute";
import { MAX_THEMES, OTHER_THEME, type BriefData } from "./data";
import { DOT_ORDER, layoutGroups } from "./dot-layout";

/**
 * The coherence overview on screen: one field of dots, one per target pair,
 * that re-forms for each step of the overview. The same particles move
 * between stages, so a reader sees the aligned pairs of the overview become
 * the aligned themes, or a document's pairs gather around it.
 */
export type HubStage =
  | { kind: "overview" }
  | { kind: "reinforce" }
  | { kind: "apart" }
  | { kind: "doc"; doc: string };

export interface HubParticle {
  /** Index into DOT_ORDER. */
  tone: number;
  /** The two documents of the target pair. */
  a: string;
  b: string;
  /** The shown theme of its tone that covers it (index), -1 when none. */
  theme: number;
  /** A copy for a second theme covering the same pair (themes are coverage). */
  ghost: boolean;
  /** For a ghost, the particle it splits from; otherwise its own index. */
  base: number;
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
}

/** Aligned, partially aligned, potential misalignment, no clear relationship,
 *  then the lighter inks for pairs outside every theme. */
export const HUB_INK = ["#2a7443", "#a9b3a4", "#d2432c", "#cfcfc9", "#a8cbb2", "#f1b1a4"];

/** Room above the groups for their labels. */
const LABEL_BAND = 30;
/** Room above each cluster around a document in focus, for the other
 *  document's name (up to three lines). */
export const FOCUS_LABEL = 56;
/** Room between the name in focus and the clusters, for the spokes. */
const SPOKE = 34;
/** A step with fewer pairs may draw its dots larger, up to this factor of
 *  the overview's size, so the same dots stay recognisable between steps. */
const ZOOM = 1.8;

export function hubParticles(data: BriefData): HubParticle[] {
  const shown = (rows: BriefData["together"]["rows"]) =>
    rows.slice(0, MAX_THEMES).map((r) => getStorylineDocPairKeys(r.storyline));
  const keys = { reinforce: shown(data.together.rows), apart: shown(data.apart.rows) };
  const base: HubParticle[] = [];
  const ghosts: HubParticle[] = [];
  data.scope.comparisons.forEach((c, i) => {
    const tone = toneOf(c.level);
    const sets = tone === "reinforce" ? keys.reinforce : tone === "apart" ? keys.apart : [];
    const key = getDocPairKey(c.a.doc, c.b.doc);
    const members = sets.flatMap((set, idx) => (set.has(key) ? [idx] : []));
    const t = DOT_ORDER.indexOf(tone);
    base.push({ tone: t, a: c.a.doc, b: c.b.doc, theme: members[0] ?? -1, ghost: false, base: i });
    for (const m of members.slice(1)) {
      ghosts.push({ tone: t, a: c.a.doc, b: c.b.doc, theme: m, ghost: true, base: i });
    }
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
  };
}

/** The dot pitch of the overview at this size: every pair, by rating. */
function overviewPitch(particles: HubParticle[], width: number, height: number): number {
  const counts = DOT_ORDER.map((_, t) => ({
    count: particles.filter((p) => !p.ghost && p.tone === t).length,
  }));
  return layoutGroups(counts, 1, width, Math.max(1, height - LABEL_BAND)).pitch;
}

/** Place the members of each group side by side in the field, like the
 *  brief's dot field. With `maxPitch`, a field that would draw its dots
 *  larger is drawn at that pitch instead, as a smaller block in the middle. */
function placeGroups(
  layout: HubLayout,
  members: { key: string; ids: number[]; ink: (i: number) => number; texture: boolean }[],
  width: number,
  height: number,
  maxPitch = Infinity,
) {
  const present = members.filter((m) => m.ids.length > 0);
  const specs = present.map((m) => ({ count: m.ids.length, texture: m.texture }));
  const band = Math.max(1, height - LABEL_BAND);
  let grid = layoutGroups(specs, 1, width, band);
  let dx = 0;
  let top = LABEL_BAND;
  let bottom = height;
  if (grid.pitch > maxPitch) {
    const k = maxPitch / grid.pitch;
    grid = layoutGroups(specs, 1, width * k, band * k);
    const used = grid.groups.length > 0 ? grid.groups[grid.groups.length - 1].x1 : 0;
    dx = (width - used) / 2;
    top = LABEL_BAND + (band - band * k) / 2;
    bottom = top + band * k;
  }
  let dot = 0;
  grid.groups.forEach((g) => {
    const m = present[g.index];
    for (const id of m.ids) {
      layout.x[id] = grid.xs[dot] + dx;
      layout.y[id] = grid.ys[dot] + top;
      layout.r[id] = grid.radius;
      layout.visible[id] = 1;
      layout.ink[id] = m.ink(id);
      layout.small[id] = grid.small[dot];
      dot += 1;
    }
    layout.groups.push({
      key: m.key,
      count: m.ids.length,
      x0: g.x0 + dx,
      x1: g.x1 + dx,
      y0: top,
      y1: bottom,
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
    const other = stage.kind === "reinforce" ? 4 : 5;
    placeGroups(
      layout,
      [
        ...rows.map((row, idx) => ({
          key: row.storyline.name,
          ids: ids((p) => p.tone === t && p.theme === idx),
          ink: () => t,
          texture: stage.kind === "apart",
        })),
        {
          key: OTHER_THEME,
          ids: ids((p) => !p.ghost && p.tone === t && p.theme === -1),
          ink: () => other,
          texture: stage.kind === "apart",
        },
      ],
      width,
      height,
      maxPitch,
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
  // The document's name takes the middle third (at most 11rem).
  const middle = Math.min(width / 3, 176);
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
  const boxH = Math.max(1, slot - FOCUS_LABEL - FOCUS_PAD);
  const boxW = Math.max(1, Math.min(columnWidth, boxH * 2.2));
  // Clusters take the shape of the room they have, so the largest fills it.
  const aspect = boxW / boxH;
  const shape = (n: number) => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * aspect)));
    return { cols, rows: Math.ceil(n / cols) };
  };
  const largest = shape(Math.max(1, ...members.map((ids) => ids.length)));
  const pitch = Math.max(1.2, Math.min(maxPitch, boxW / largest.cols, boxH / largest.rows));
  members.forEach((list, k) => {
    if (list.length === 0) return;
    const onLeft = k < left;
    const count = onLeft ? left : partners.length - left;
    const row = onLeft ? k : k - left;
    // A shorter side is centred on the document.
    const top = FOCUS_PAD + (perSide - count) * (slot / 2) + row * slot + FOCUS_LABEL;
    const { cols, rows } = shape(list.length);
    const w = cols * pitch;
    const h = rows * pitch;
    const x0 = onLeft ? cx - middle / 2 - SPOKE - w : cx + middle / 2 + SPOKE;
    const apart = DOT_ORDER.indexOf("apart");
    list.forEach((id, n) => {
      const col = n % cols;
      const row = Math.floor(n / cols);
      layout.x[id] = x0 + col * pitch + pitch / 2;
      layout.y[id] = top + row * pitch + pitch / 2;
      layout.r[id] = Math.max(0.55, pitch * 0.34);
      layout.visible[id] = 1;
      layout.ink[id] = particles[id].tone;
      // The checker texture tells potential misalignment apart without colour.
      if (particles[id].tone === apart && (col + row) % 2 === 1) layout.small[id] = 1;
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
