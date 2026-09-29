import { NO_AREA } from "./areas";
import { fitProjection, type Box, type GeoFile } from "./geo";
import { NO_PLACE, type ContractsFile, type LensKey } from "./model";
import { placeKey } from "./places";
import { largestRemainder, sliceSquares, squaresFor, UNIT, type Slice } from "./units";

/**
 * The field of the overview: the whole record as squares of equal money, laid
 * out anew at each step, so the squares move from one layout to the next. By
 * year (the record, then its purpose); by place on the map; by policy area
 * beside the areas' targets. A focus, or tenders instead of money, is drawn
 * as an overlay of its own marks while the record's squares step aside.
 */

export type PlacesLayer = "money" | "all" | "match" | "mis";

export type Stage =
  | { kind: "record" }
  | { kind: "purpose"; key: string }
  | { kind: "places"; layer: PlacesLayer; key: string }
  | { kind: "areas"; lens: LensKey; key: string };

export type Ink = "principal" | "significant" | "rest";

export interface FieldModel {
  /** Every square's ink, in a fixed order: principal, significant, then the rest by year. */
  inks: Ink[];
  /** The year of each square in the record. */
  years: number[];
  yearOrder: number[];
  /** What each square is in the record (the rest carry no contract). */
  yearSlices: (Slice | null)[];
  columns: { year: number; principal: number; significant: number; rest: number }[];
}

export function buildField(file: ContractsFile, unit: number = UNIT): FieldModel {
  const yearOrder = file.years.map((y) => y.year);
  const cells = yearOrder.map(String);
  const tier = (t: "principal" | "significant") => file.contracts.filter((c) => c.tier === t);
  const items = (t: "principal" | "significant") => tier(t).map((c) => ({ id: c.id, value: c.value, cell: String(c.year) }));
  const total = (t: "principal" | "significant") => tier(t).reduce((s, c) => s + c.value, 0);
  const p = sliceSquares(items("principal"), squaresFor(total("principal"), unit), cells);
  const s = sliceSquares(items("significant"), squaresFor(total("significant"), unit), cells);
  const perYear = largestRemainder(
    file.years.map((y) => y.value),
    squaresFor(file.census.value, unit),
  );
  const columns = yearOrder.map((year, i) => {
    const principal = p.filter((q) => q.cell === String(year)).length;
    const significant = s.filter((q) => q.cell === String(year)).length;
    return { year, principal, significant, rest: Math.max(0, perYear[i] - principal - significant) };
  });
  const rest = columns.flatMap((c) => new Array<number>(c.rest).fill(c.year));
  return {
    inks: [...p.map(() => "principal" as const), ...s.map(() => "significant" as const), ...rest.map(() => "rest" as const)],
    years: [...p.map((q) => Number(q.cell)), ...s.map((q) => Number(q.cell)), ...rest],
    yearOrder,
    yearSlices: [...p, ...s, ...rest.map(() => null)],
    columns,
  };
}

export interface Placed {
  x: number;
  y: number;
  visible: boolean;
  slice: Slice | null;
  /** Drawn in another ink than its own in this step (a year's green money outside the focus). */
  ink?: Ink;
}

export type LabelKind =
  | "year"
  | "columnValue"
  | "columnShare"
  | "columnFocus"
  | "unit"
  | "head"
  | "rowName"
  | "rowTargets"
  | "rowValue"
  | "place"
  | "band";

export interface FieldLabel {
  key: string;
  kind: LabelKind;
  x: number;
  y: number;
  align: "start" | "middle" | "end";
  values: Record<string, string | number | boolean>;
}

export interface TargetDot {
  id: string;
  row: string;
  x: number;
  y: number;
  r: number;
  /** With a strongly matching contract, or without. */
  ink: "target" | "targetNone";
}

/** An overlay's ink: money mainly for nature or climate, or a tender strongly
 *  matching / potentially misaligned with a target. */
export type MarkInk = "principal" | "match" | "mis";

export interface Mark {
  x: number;
  y: number;
  shape: "square" | "dot";
  ink: MarkInk;
  /** The place or policy area it belongs to. */
  cell: string;
}

export interface Block {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  n: number;
}

export interface Leader {
  code: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FieldLayout {
  squares: Placed[];
  /** Distance between square centres. */
  pitch: number;
  labels: FieldLabel[];
  targets: TargetDot[];
  outlines: { code: string; d: string }[] | null;
  /** The map's box in the places step. */
  map: Box | null;
  /** Each policy area's band, to point at a row. */
  bands: { id: string; y: number; h: number }[];
  /** Each place's block of squares or dots on the map. */
  blocks: Block[];
  /** Hairlines from a place's point to its block when the block sits elsewhere. */
  leaders: Leader[];
  /** A focus's squares or the tenders' dots, drawn over the field. */
  overlay: { marks: Mark[]; pitch: number } | null;
}

/** One row of the policy areas, in the page's order. */
export interface AreaRowB {
  id: string;
  name: string;
  /** The money mainly for nature or climate the row stands for (in focus). */
  value: number;
  targets: { id: string; matched: boolean }[];
}

export interface OverlaySpec {
  shape: "square" | "dot";
  ink: MarkInk;
  /** What one mark stands for: money per square, or 1 (one tender). */
  unit: number;
  cells: { id: string; n: number }[];
}

export interface LayoutContext {
  rows?: AreaRowB[];
  geo?: GeoFile | null;
  overlay?: OverlaySpec | null;
  /** The money in focus in each year, as squares and as money, in year order. */
  yearFocus?: { squares: number[]; values: number[] } | null;
  /** A place's name on the map as the page writes it, measured. */
  labelSize?: (code: string) => { w: number; h: number };
}

// ── By year ──────────────────────────────────────────────────────────

const COLUMN_TOP = 26;
const COLUMN_BOTTOM = 24;

function yearLayout(model: FieldModel, file: ContractsFile, box: { w: number; h: number }, purpose: boolean, focus: LayoutContext["yearFocus"]): FieldLayout {
  const n = Math.max(1, model.columns.length);
  const gap = Math.min(14, Math.max(4, box.w * 0.015));
  const cw = (box.w - gap * (n - 1)) / n;
  const plotH = box.h - COLUMN_TOP - COLUMN_BOTTOM;
  const counts = model.columns.map((c) => c.principal + c.significant + c.rest);
  let pitch = 1.2;
  for (let p = 12; p >= 1.2; p -= 0.05) {
    const per = Math.floor(cw / p);
    if (per < 1) continue;
    if (Math.max(0, ...counts.map((c) => Math.ceil(c / per))) * p <= plotH) {
      pitch = p;
      break;
    }
  }
  const per = Math.max(1, Math.floor(cw / pitch));
  const base = box.h - COLUMN_BOTTOM;
  const colOf = new Map(model.yearOrder.map((y, i) => [y, i]));
  const next = new Map<number, number>();
  const greenSeen = new Map<number, number>();
  const squares = model.inks.map((ink, i) => {
    const year = model.years[i];
    const col = colOf.get(year) ?? 0;
    const k = next.get(year) ?? 0;
    next.set(year, k + 1);
    const x0 = col * (cw + gap) + (cw - per * pitch) / 2;
    const placed: Placed = {
      x: x0 + (k % per) * pitch + pitch / 2,
      y: base - Math.floor(k / per) * pitch - pitch / 2,
      visible: true,
      slice: model.yearSlices[i],
    };
    // With a focus, a year's principal squares beyond the focus's own turn light.
    if (purpose && focus && ink === "principal") {
      const seen = greenSeen.get(year) ?? 0;
      greenSeen.set(year, seen + 1);
      if (seen >= (focus.squares[col] ?? 0)) placed.ink = "significant";
    }
    return placed;
  });

  const sorted = [...file.years.map((y) => y.contracts)].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const labels: FieldLabel[] = [];
  if (purpose && focus) labels.push({ key: "unit", kind: "unit", x: 0, y: 2, align: "start", values: { of: "years" } });
  model.columns.forEach((c, i) => {
    const y = file.years[i];
    const cx = i * (cw + gap) + cw / 2;
    const thin = y.contracts < median * 0.2;
    labels.push({ key: `year:${c.year}`, kind: "year", x: cx, y: box.h - 6, align: "middle", values: { year: c.year, thin } });
    const top = base - Math.ceil(counts[i] / per) * pitch - 8;
    if (!purpose) labels.push({ key: `value:${c.year}`, kind: "columnValue", x: cx, y: top, align: "middle", values: { year: c.year, value: y.value, thin } });
    else if (focus) labels.push({ key: `focus:${c.year}`, kind: "columnFocus", x: cx, y: top, align: "middle", values: { year: c.year, value: focus.values[i] ?? 0, thin } });
    else labels.push({ key: `share:${c.year}`, kind: "columnShare", x: cx, y: top, align: "middle", values: { year: c.year, share: y.value > 0 ? y.principal.value / y.value : 0, thin } });
  });
  return { squares, pitch, labels, targets: [], outlines: null, map: null, bands: [], blocks: [], leaders: [], overlay: null };
}

// ── Blocks and names, clear of each other ────────────────────────────

/** Push overlapping blocks apart, the least overlap first, until each is at
 *  least `margin` from the others and inside the bounds. */
export function resolveBlocks<T extends { x: number; y: number; w: number; h: number }>(blocks: T[], bounds: Box, margin: number): T[] {
  const list = blocks.map((b) => ({ ...b }));
  const clamp = (b: T) => {
    b.x = Math.max(bounds.x, Math.min(bounds.x + bounds.w - b.w, b.x));
    b.y = Math.max(bounds.y, Math.min(bounds.y + bounds.h - b.h, b.y));
  };
  list.forEach(clamp);
  for (let it = 0; it < 200; it++) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const dx = Math.min(a.x + a.w, b.x + b.w) + margin - Math.max(a.x, b.x);
        const dy = Math.min(a.y + a.h, b.y + b.h) + margin - Math.max(a.y, b.y);
        if (dx <= 1e-6 || dy <= 1e-6) continue;
        moved = true;
        if (dx < dy) {
          const d = (dx / 2 + 0.01) * (a.x + a.w / 2 <= b.x + b.w / 2 ? -1 : 1);
          a.x += d;
          b.x -= d;
        } else {
          const d = (dy / 2 + 0.01) * (a.y + a.h / 2 <= b.y + b.h / 2 ? -1 : 1);
          a.y += d;
          b.y -= d;
        }
      }
    }
    list.forEach(clamp);
    if (!moved) break;
  }
  return list;
}

export interface LabelItem {
  key: string;
  w: number;
  h: number;
  /** The block (or point) the name belongs beside. */
  around: Box;
}

/**
 * Names beside their blocks, in the order given (the largest first): below,
 * above, beside, then on the diagonals, a little further out each round. A
 * name that finds no room clear of the blocks, the names already placed and
 * the bounds gets none (it shows on pointing).
 */
export function placeLabels(items: LabelItem[], obstacles: Box[], bounds: Box): Map<string, Box | null> {
  const placed: Box[] = [];
  const out = new Map<string, Box | null>();
  const hits = (r: Box) =>
    r.x < bounds.x ||
    r.y < bounds.y ||
    r.x + r.w > bounds.x + bounds.w ||
    r.y + r.h > bounds.y + bounds.h ||
    [...obstacles, ...placed].some((o) => r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
  for (const it of items) {
    const { x, y, w: bw, h: bh } = it.around;
    const cx = x + bw / 2;
    const cy = y + bh / 2;
    const { w, h } = it;
    let at: Box | null = null;
    for (const d of [2, 7, 14]) {
      const cands = [
        { x: cx - w / 2, y: y + bh + d },
        { x: cx - w / 2, y: y - h - d },
        { x: x + bw + d, y: cy - h / 2 },
        { x: x - w - d, y: cy - h / 2 },
        { x: x + bw + d - 4, y: y + bh + d - 4 },
        { x: x - w - d + 4, y: y + bh + d - 4 },
        { x: x + bw + d - 4, y: y - h - d + 4 },
        { x: x - w - d + 4, y: y - h - d + 4 },
      ];
      at = cands.map((c) => ({ ...c, w, h })).find((r) => !hits(r)) ?? null;
      if (at) break;
    }
    if (at) placed.push(at);
    out.set(it.key, at);
  }
  return out;
}

// ── On the map ───────────────────────────────────────────────────────

/** Room below the map for the unnamed and the band's places, and their names. */
const BAND_SHARE = 0.3;
const BAND_MIN = 90;
const BAND_MAX = 170;
const BAND_NAME = 18;
const BAND_GAP = 28;
const DEFAULT_NAME = { w: 72, h: 26 };

function mapFrame(box: { w: number; h: number }, geo: GeoFile) {
  const band = Math.round(Math.min(BAND_MAX, Math.max(BAND_MIN, box.h * BAND_SHARE)));
  const map: Box = { x: 6, y: 6, w: Math.max(40, box.w - 12), h: Math.max(40, box.h - band - 12) };
  const proj = fitProjection(geo, map);
  const features = new Map(geo.features.map((f) => [f.code, f]));
  const anchors = new Map([...features].map(([code, f]) => [code, proj.point(f)]));
  const bandTop = map.y + map.h + BAND_NAME + 6;
  const bandH = Math.max(20, box.h - bandTop - 4);
  const bandCodes = [NO_PLACE, ...(geo.band ?? []).filter((c) => features.has(c))];
  return { map, proj, features, anchors, bandTop, bandH, bandCodes, outlines: geo.features.map((f) => ({ code: f.code, d: proj.path(f) })) };
}

type Frame = ReturnType<typeof mapFrame>;

/** Largest pitch at which the band's blocks still fit its height. */
function bandPitch(frame: Frame, counts: Map<string, number>, cap: number): number {
  const most = Math.max(1, ...frame.bandCodes.map((c) => counts.get(c) ?? 0));
  return Math.max(1.2, Math.min(cap, frame.bandH / Math.ceil(Math.sqrt(most))));
}

function mapBlocks(frame: Frame, counts: Map<string, number>, pitch: number): { blocks: Block[]; leaders: Leader[] } {
  const shape = (n: number) => {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    return { cols, w: n > 0 ? cols * pitch : 0, h: n > 0 ? Math.ceil(n / cols) * pitch : 0 };
  };
  const band: Block[] = [];
  let right = frame.map.x - BAND_GAP;
  for (const code of frame.bandCodes) {
    const n = counts.get(code) ?? 0;
    const { w, h } = shape(n);
    const anchor = frame.anchors.get(code);
    const x = Math.max(right + BAND_GAP, anchor ? anchor[0] - w / 2 : frame.map.x);
    band.push({ code, x, y: frame.bandTop, w, h, n });
    right = x + Math.max(w, 150);
  }
  const loose = [...frame.features.keys()]
    .filter((code) => !frame.bandCodes.includes(code) && (counts.get(code) ?? 0) > 0)
    .map((code) => {
      const n = counts.get(code) ?? 0;
      const { w, h } = shape(n);
      const [ax, ay] = frame.anchors.get(code)!;
      return { code, x: ax - w / 2, y: ay - h / 2, w, h, n };
    });
  const resolved = resolveBlocks(loose, frame.map, 4);
  const leaders: Leader[] = [];
  for (const b of resolved) {
    const [ax, ay] = frame.anchors.get(b.code)!;
    const x2 = Math.max(b.x, Math.min(ax, b.x + b.w));
    const y2 = Math.max(b.y, Math.min(ay, b.y + b.h));
    if (Math.hypot(x2 - ax, y2 - ay) > 7) leaders.push({ code: b.code, x1: ax, y1: ay, x2, y2 });
  }
  for (const b of band) {
    const anchor = frame.anchors.get(b.code);
    if (anchor && b.n > 0) leaders.push({ code: b.code, x1: anchor[0], y1: anchor[1], x2: b.x + b.w / 2, y2: b.y - BAND_NAME - 2 });
  }
  return { blocks: [...band, ...resolved], leaders };
}

function cellAt(b: Block, k: number, pitch: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(b.n)));
  return { x: b.x + (k % cols) * pitch + pitch / 2, y: b.y + Math.floor(k / cols) * pitch + pitch / 2 };
}

function placeNames(frame: Frame, blocks: Block[], ctx: LayoutContext, all: boolean): FieldLabel[] {
  const labels: FieldLabel[] = [];
  for (const b of blocks) {
    if (!frame.bandCodes.includes(b.code)) continue;
    labels.push({ key: `band:${b.code}`, kind: "band", x: b.x, y: b.y - BAND_NAME + 2, align: "start", values: { code: b.code } });
  }
  const byCode = new Map(blocks.map((b) => [b.code, b]));
  const order = [...frame.features.keys()]
    .filter((code) => !frame.bandCodes.includes(code))
    .filter((code) => all || (byCode.get(code)?.n ?? 0) > 0)
    .sort((a, b) => (byCode.get(b)?.n ?? 0) - (byCode.get(a)?.n ?? 0) || a.localeCompare(b));
  const items: LabelItem[] = order.map((code) => {
    const b = byCode.get(code);
    const [ax, ay] = frame.anchors.get(code)!;
    const size = ctx.labelSize?.(code) ?? DEFAULT_NAME;
    return { key: code, ...size, around: b && b.n > 0 ? { x: b.x, y: b.y, w: b.w, h: b.h } : { x: ax, y: ay, w: 0, h: 0 } };
  });
  const obstacles = blocks.filter((b) => b.n > 0).map((b) => ({ x: b.x - 1, y: b.y - 1, w: b.w + 2, h: b.h + 2 }));
  const bounds = { x: 0, y: 0, w: frame.map.x * 2 + frame.map.w, h: frame.bandTop - BAND_NAME - 4 };
  const at = placeLabels(items, obstacles, bounds);
  for (const code of order) {
    const r = at.get(code);
    if (!r) continue;
    labels.push({ key: `place:${code}`, kind: "place", x: r.x + r.w / 2, y: r.y, align: "middle", values: { code } });
  }
  return labels;
}

function placeLayout(model: FieldModel, file: ContractsFile, stage: Extract<Stage, { kind: "places" }>, box: { w: number; h: number }, ctx: LayoutContext, base: FieldLayout): FieldLayout {
  const frame = mapFrame(box, ctx.geo!);
  const known = (code: string) => (frame.features.has(code) ? code : NO_PLACE);

  // The money mainly for nature or climate, square by square, by place.
  const principal = file.contracts.filter((c) => c.tier === "principal");
  const count = model.inks.filter((i) => i === "principal").length;
  const slices = sliceSquares(
    principal.map((c) => ({ id: c.id, value: c.value, cell: known(placeKey(c)) })),
    count,
    [...frame.bandCodes, ...[...frame.features.keys()].filter((c) => !frame.bandCodes.includes(c))],
  );

  const moneyCounts = new Map<string, number>();
  for (const s of slices) moneyCounts.set(s.cell, (moneyCounts.get(s.cell) ?? 0) + 1);

  // Which cell each square of the record stands in: the green ones by their
  // contract's place; for all contracts, the rest fill each place's share of
  // the whole record.
  const cellOf: (string | null)[] = new Array(model.inks.length).fill(null);
  let s = 0;
  model.inks.forEach((ink, i) => {
    if (ink === "principal") cellOf[i] = slices[s++]?.cell ?? NO_PLACE;
  });
  let counts = moneyCounts;
  if (stage.layer === "all" && file.places && file.places.length > 0) {
    const alloc = largestRemainder(
      file.places.map((p) => p.value),
      model.inks.length,
    );
    const room = new Map<string, number>();
    file.places.forEach((p, i) => room.set(known(p.code), (room.get(known(p.code)) ?? 0) + alloc[i]));
    const used = new Map<string, number>();
    model.inks.forEach((ink, i) => {
      const cell = cellOf[i];
      if (ink !== "principal" || cell === null) return;
      if ((used.get(cell) ?? 0) < (room.get(cell) ?? 0)) used.set(cell, (used.get(cell) ?? 0) + 1);
      else cellOf[i] = null;
    });
    const open = [...room.entries()];
    let r = 0;
    model.inks.forEach((_, i) => {
      if (cellOf[i] !== null) return;
      while (r < open.length && (used.get(open[r][0]) ?? 0) >= open[r][1]) r++;
      const cell = r < open.length ? open[r][0] : NO_PLACE;
      cellOf[i] = cell;
      used.set(cell, (used.get(cell) ?? 0) + 1);
    });
    counts = used;
  }

  const all = stage.layer === "all";
  const squarePitch = all ? bandPitch(frame, counts, 3) : Math.min(bandPitch(frame, counts, 6), Math.max(3, frame.map.w / 110));
  const { blocks, leaders } = mapBlocks(frame, counts, squarePitch);
  const byCode = new Map(blocks.map((b) => [b.code, b]));
  const next = new Map<string, number>();
  const squares: Placed[] = model.inks.map((ink, i) => {
    const cell = all || ink === "principal" ? cellOf[i] : null;
    const b = cell !== null ? byCode.get(cell) : undefined;
    if (!b) return { ...base.squares[i], visible: false };
    const k = next.get(b.code) ?? 0;
    next.set(b.code, k + 1);
    return { ...cellAt(b, k, squarePitch), visible: true, slice: ink === "principal" ? slices[i] ?? null : null };
  });

  // A focus's money or the tenders: their own marks, the record's squares set aside where they were.
  const spec = stage.layer === "all" ? null : ctx.overlay ?? null;
  if (spec) {
    const oc = new Map<string, number>();
    for (const c of spec.cells) oc.set(known(c.id), (oc.get(known(c.id)) ?? 0) + c.n);
    const cap = spec.shape === "dot" ? (spec.ink === "mis" ? 5.5 : 4) : 6;
    const pitch = Math.min(bandPitch(frame, oc, cap), Math.max(3, frame.map.w / 110));
    const ob = mapBlocks(frame, oc, pitch);
    const marks: Mark[] = [];
    for (const b of ob.blocks) for (let k = 0; k < b.n; k++) marks.push({ ...cellAt(b, k, pitch), shape: spec.shape, ink: spec.ink, cell: b.code });
    return {
      squares: squares.map((q) => ({ ...q, visible: false })),
      pitch: squarePitch,
      labels: [...placeNames(frame, ob.blocks, ctx, false), { key: "unit", kind: "unit", x: box.w - 4, y: frame.bandTop - BAND_NAME - 2, align: "end", values: { unit: spec.unit, shape: spec.shape } }],
      targets: [],
      outlines: frame.outlines,
      map: frame.map,
      bands: [],
      blocks: ob.blocks,
      leaders: ob.leaders,
      overlay: { marks, pitch },
    };
  }
  return {
    squares,
    pitch: squarePitch,
    labels: [...placeNames(frame, blocks, ctx, true), { key: "unit", kind: "unit", x: box.w - 4, y: frame.bandTop - BAND_NAME - 2, align: "end", values: { unit: UNIT, shape: "square" } }],
    targets: [],
    outlines: frame.outlines,
    map: frame.map,
    bands: [],
    blocks,
    leaders,
    overlay: null,
  };
}

// ── By policy area, beside the targets ───────────────────────────────

const ROW_NAME = 18;
const ROW_GAP = 14;
const HEAD = 22;
/** The targets' column starts here, a share of the width. */
const TARGETS_AT = 0.61;
/** Room right of the money for its value. */
const VALUE_ROOM = 104;

function areaLayout(model: FieldModel, file: ContractsFile, stage: Extract<Stage, { kind: "areas" }>, box: { w: number; h: number }, ctx: LayoutContext, base: FieldLayout): FieldLayout {
  const rows = ctx.rows ?? [];
  const order = rows.map((r) => r.id);
  const known = new Set(order);
  const principal = file.contracts.filter((c) => c.tier === "principal");
  const count = model.inks.filter((i) => i === "principal").length;
  const slices = sliceSquares(
    principal.map((c) => {
      const a = c.areas[stage.lens];
      return { id: c.id, value: c.value, cell: a && known.has(a) ? a : NO_AREA };
    }),
    count,
    order,
  );
  const baseCounts = new Map<string, number>();
  for (const s of slices) baseCounts.set(s.cell, (baseCounts.get(s.cell) ?? 0) + 1);
  const spec = ctx.overlay ?? null;
  const overlayCounts = new Map<string, number>();
  if (spec) for (const c of spec.cells) overlayCounts.set(c.id, (overlayCounts.get(c.id) ?? 0) + c.n);
  const shown = spec ? overlayCounts : baseCounts;

  const tx = Math.round(box.w * TARGETS_AT);
  const maxN = Math.max(1, ...order.map((id) => shown.get(id) ?? 0));
  const maxT = Math.max(1, ...rows.map((r) => r.targets.length));
  let pitch = Math.min(7, (tx - 16 - VALUE_ROOM) / maxN);
  let dp = Math.min(7, (box.w - 28 - tx) / Math.ceil(maxT / 2));
  const heightFor = (p: number, d: number) => HEAD + rows.length * (ROW_NAME + Math.max(p, 2 * d) + ROW_GAP);
  while ((pitch > 1.5 || dp > 1.5) && heightFor(pitch, dp) > box.h) {
    pitch = Math.max(1.5, pitch - 0.25);
    dp = Math.max(1.5, dp - 0.25);
  }
  const band = Math.max(pitch, 2 * dp);

  const labels: FieldLabel[] = [
    { key: "head:money", kind: "head", x: 0, y: 2, align: "start", values: { col: "money" } },
    { key: "head:targets", kind: "head", x: tx, y: 2, align: "start", values: { col: "targets" } },
  ];
  if (spec) labels.push({ key: "unit", kind: "unit", x: tx - 16, y: 2, align: "end", values: { unit: spec.unit, shape: spec.shape } });
  const targets: TargetDot[] = [];
  const bands: FieldLayout["bands"] = [];
  const mid = new Map<string, number>();
  rows.forEach((row, i) => {
    const y0 = HEAD + i * (ROW_NAME + band + ROW_GAP);
    const m = y0 + ROW_NAME + band / 2;
    mid.set(row.id, m);
    bands.push({ id: row.id, y: y0, h: ROW_NAME + band });
    labels.push({ key: `row:${row.id}`, kind: "rowName", x: 0, y: y0 + 14, align: "start", values: { id: row.id, name: row.name } });
    const n = shown.get(row.id) ?? 0;
    labels.push({ key: `value:${row.id}`, kind: "rowValue", x: n * pitch + 8, y: m, align: "start", values: { id: row.id, value: row.value } });
    row.targets.forEach((t, k) => {
      targets.push({ id: t.id, row: row.id, x: tx + Math.floor(k / 2) * dp + dp / 2, y: m - dp / 2 + (k % 2) * dp, r: Math.max(1, dp * 0.34), ink: t.matched ? "target" : "targetNone" });
    });
    labels.push({ key: `targets:${row.id}`, kind: "rowTargets", x: tx + Math.ceil(row.targets.length / 2) * dp + 6, y: m, align: "start", values: { id: row.id, count: row.targets.length } });
  });

  const next = new Map<string, number>();
  let s = 0;
  const squares: Placed[] = model.inks.map((ink, i) => {
    if (ink !== "principal") return { ...base.squares[i], visible: false };
    const slice = slices[s++];
    const k = next.get(slice.cell) ?? 0;
    next.set(slice.cell, k + 1);
    const y = mid.get(slice.cell);
    if (y === undefined) return { ...base.squares[i], visible: false, slice };
    return { x: k * pitch + pitch / 2, y, visible: !spec, slice };
  });

  let overlay: FieldLayout["overlay"] = null;
  if (spec) {
    const marks: Mark[] = [];
    for (const id of order) {
      const y = mid.get(id)!;
      for (let k = 0; k < (overlayCounts.get(id) ?? 0); k++) marks.push({ x: k * pitch + pitch / 2, y, shape: "square", ink: spec.ink, cell: id });
    }
    overlay = { marks, pitch };
  }
  return { squares, pitch, labels, targets, outlines: null, map: null, bands, blocks: [], leaders: [], overlay };
}

export function layoutField(model: FieldModel, file: ContractsFile, stage: Stage, box: { w: number; h: number }, ctx: LayoutContext = {}): FieldLayout {
  const purpose = stage.kind !== "record";
  const years = yearLayout(model, file, box, purpose, stage.kind === "purpose" ? ctx.yearFocus ?? null : null);
  if (stage.kind === "record" || stage.kind === "purpose") return years;
  if (stage.kind === "areas" && ctx.rows) return areaLayout(model, file, stage, box, ctx, years);
  if (stage.kind === "places" && ctx.geo) return placeLayout(model, file, stage, box, ctx, years);
  return years;
}
