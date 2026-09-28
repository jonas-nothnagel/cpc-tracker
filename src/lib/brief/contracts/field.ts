import { NO_AREA, type AreaRow } from "./areas";
import { fitProjection, type Box, type GeoFile } from "./geo";
import { NO_PLACE, type ContractsFile, type LensKey } from "./model";
import { placeKey, type PlaceRow } from "./places";
import { largestRemainder, sliceSquares, squaresFor, UNIT, type Slice } from "./units";

/**
 * The field of the overview: the whole record as squares of equal money, laid
 * out anew at each step. By year (the record; then its purpose, in place),
 * then only the money mainly for nature or climate: by policy area beside
 * the area's targets, and by place on the map. The squares are the same
 * throughout, so they can move from one layout to the next.
 */

export type Stage =
  | { kind: "record" }
  | { kind: "purpose" }
  | { kind: "areas"; lens: LensKey }
  | { kind: "places" };

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
}

export type LabelKind = "year" | "columnValue" | "columnShare" | "rowName" | "rowTargets" | "rowValue" | "place" | "noPlace";

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
}

export interface FieldLayout {
  squares: Placed[];
  /** Distance between square centres. */
  pitch: number;
  labels: FieldLabel[];
  targets: TargetDot[];
  outlines: { code: string; d: string }[] | null;
  /** The areas' spine (targets left, money right); 0 in other steps. */
  spine: number;
  /** The map's box in the places step. */
  map: Box | null;
  /** Each policy area's band, to point at a row. */
  bands: { id: string; y: number; h: number }[];
}

export interface LayoutContext {
  rows?: AreaRow[];
  places?: PlaceRow[];
  geo?: GeoFile | null;
}

const COLUMN_TOP = 26;
const COLUMN_BOTTOM = 24;

function yearLayout(model: FieldModel, file: ContractsFile, box: { w: number; h: number }, purpose: boolean): FieldLayout {
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
  const squares = model.inks.map((_, i) => {
    const year = model.years[i];
    const col = colOf.get(year) ?? 0;
    const k = next.get(year) ?? 0;
    next.set(year, k + 1);
    const x0 = col * (cw + gap) + (cw - per * pitch) / 2;
    return {
      x: x0 + (k % per) * pitch + pitch / 2,
      y: base - Math.floor(k / per) * pitch - pitch / 2,
      visible: true,
      slice: model.yearSlices[i],
    };
  });

  const sorted = [...file.years.map((y) => y.contracts)].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const labels: FieldLabel[] = [];
  model.columns.forEach((c, i) => {
    const y = file.years[i];
    const cx = i * (cw + gap) + cw / 2;
    const thin = y.contracts < median * 0.2;
    labels.push({ key: `year:${c.year}`, kind: "year", x: cx, y: box.h - 6, align: "middle", values: { year: c.year, thin } });
    const top = base - Math.ceil(counts[i] / per) * pitch - 8;
    labels.push(
      purpose
        ? { key: `share:${c.year}`, kind: "columnShare", x: cx, y: top, align: "middle", values: { year: c.year, share: y.value > 0 ? y.principal.value / y.value : 0, thin } }
        : { key: `value:${c.year}`, kind: "columnValue", x: cx, y: top, align: "middle", values: { year: c.year, value: y.value, thin } },
    );
  });
  return { squares, pitch, labels, targets: [], outlines: null, spine: 0, map: null, bands: [] };
}

const ROW_NAME = 19;
const ROW_GAP = 14;
const BAND = 3;

function areaLayout(model: FieldModel, file: ContractsFile, lens: LensKey, box: { w: number; h: number }, rows: AreaRow[], base: FieldLayout): FieldLayout {
  const order = rows.map((r) => r.id);
  const known = new Set(order);
  const principal = file.contracts.filter((c) => c.tier === "principal");
  const count = model.inks.filter((i) => i === "principal").length;
  const slices = sliceSquares(
    principal.map((c) => {
      const area = c.areas[lens];
      return { id: c.id, value: c.value, cell: area && known.has(area) ? area : NO_AREA };
    }),
    count,
    order,
  );
  const perRow = new Map<string, number>();
  for (const s of slices) perRow.set(s.cell, (perRow.get(s.cell) ?? 0) + 1);

  const spine = Math.round(box.w * 0.36);
  const leftW = Math.max(40, spine - 16 - 72);
  const rightW = Math.max(40, box.w - spine - 16 - 118);
  const maxT = Math.max(1, ...rows.map((r) => r.targets.length));
  const maxS = Math.max(1, ...rows.map((r) => perRow.get(r.id) ?? 0));
  let pitch = Math.min(rightW / Math.ceil(maxS / BAND), leftW / Math.ceil(maxT / BAND), 9);
  const heightFor = (q: number) => rows.length * (ROW_NAME + BAND * q + ROW_GAP);
  while (pitch > 1.5 && heightFor(pitch) > box.h) pitch -= 0.25;
  const top = Math.max(0, (box.h - heightFor(pitch)) / 2);

  const labels: FieldLabel[] = [];
  const targets: TargetDot[] = [];
  const bands: FieldLayout["bands"] = [];
  const rowTop = new Map<string, number>();
  rows.forEach((row, i) => {
    const y0 = top + i * (ROW_NAME + BAND * pitch + ROW_GAP);
    rowTop.set(row.id, y0);
    const bandY = y0 + ROW_NAME;
    const mid = bandY + (BAND * pitch) / 2;
    bands.push({ id: row.id, y: y0, h: ROW_NAME + BAND * pitch });
    labels.push({ key: `row:${row.id}`, kind: "rowName", x: 0, y: y0 + 13, align: "start", values: { id: row.id, name: row.name } });
    row.targets.forEach((id, k) => {
      targets.push({
        id,
        row: row.id,
        x: spine - 10 - Math.floor(k / BAND) * pitch - pitch / 2,
        y: bandY + (k % BAND) * pitch + pitch / 2,
        r: Math.max(1, pitch * 0.34),
      });
    });
    const tw = Math.ceil(row.targets.length / BAND) * pitch;
    labels.push({ key: `targets:${row.id}`, kind: "rowTargets", x: spine - 10 - tw - 6, y: mid + 4, align: "end", values: { id: row.id, count: row.targets.length } });
    const sw = Math.ceil((perRow.get(row.id) ?? 0) / BAND) * pitch;
    labels.push({
      key: `value:${row.id}`,
      kind: "rowValue",
      x: spine + 10 + sw + 6,
      y: mid + 4,
      align: "start",
      values: { id: row.id, value: row.principal.value, contracts: row.principal.contracts },
    });
  });

  const next = new Map<string, number>();
  let s = 0;
  const squares = model.inks.map((ink, i) => {
    if (ink !== "principal") return { ...base.squares[i], visible: false };
    const slice = slices[s++];
    const k = next.get(slice.cell) ?? 0;
    next.set(slice.cell, k + 1);
    const y0 = (rowTop.get(slice.cell) ?? 0) + ROW_NAME;
    return {
      x: spine + 10 + Math.floor(k / BAND) * pitch + pitch / 2,
      y: y0 + (k % BAND) * pitch + pitch / 2,
      visible: true,
      slice,
    };
  });
  return { squares, pitch, labels, targets, outlines: null, spine, map: null, bands };
}

const MAP_BOTTOM = 70;
/** Places named on the map, by money. */
const NAMED_PLACES = 8;

function placeLayout(model: FieldModel, file: ContractsFile, box: { w: number; h: number }, places: PlaceRow[], geo: GeoFile, base: FieldLayout): FieldLayout {
  const map: Box = { x: 8, y: 8, w: box.w - 16, h: Math.max(40, box.h - MAP_BOTTOM - 16) };
  const proj = fitProjection(geo, map);
  const features = new Map(geo.features.map((f) => [f.code, f]));
  const order = places.map((r) => (features.has(r.id) ? r.id : NO_PLACE));
  const principal = file.contracts.filter((c) => c.tier === "principal");
  const count = model.inks.filter((i) => i === "principal").length;
  const slices = sliceSquares(
    principal.map((c) => {
      const key = placeKey(c);
      return { id: c.id, value: c.value, cell: features.has(key) ? key : NO_PLACE };
    }),
    count,
    [...new Set([...order, NO_PLACE])],
  );
  const pitch = Math.min(6, Math.max(3, map.w / 110));
  const perCell = new Map<string, number>();
  for (const s of slices) perCell.set(s.cell, (perCell.get(s.cell) ?? 0) + 1);

  const origin = new Map<string, { x: number; y: number; cols: number }>();
  for (const [cell, n] of perCell) {
    if (cell === NO_PLACE) {
      const cols = Math.max(1, Math.floor((box.w - 16) / pitch));
      origin.set(cell, { x: 8, y: map.y + map.h + 22, cols });
      continue;
    }
    const [px, py] = proj.point(features.get(cell)!);
    const cols = Math.ceil(Math.sqrt(n));
    const rowsN = Math.ceil(n / cols);
    origin.set(cell, { x: px - (cols * pitch) / 2, y: py - (rowsN * pitch) / 2, cols });
  }

  const next = new Map<string, number>();
  let s = 0;
  const squares = model.inks.map((ink, i) => {
    if (ink !== "principal") return { ...base.squares[i], visible: false };
    const slice = slices[s++];
    const o = origin.get(slice.cell)!;
    const k = next.get(slice.cell) ?? 0;
    next.set(slice.cell, k + 1);
    return { x: o.x + (k % o.cols) * pitch + pitch / 2, y: o.y + Math.floor(k / o.cols) * pitch + pitch / 2, visible: true, slice };
  });

  const labels: FieldLabel[] = [];
  places
    .filter((r) => features.has(r.id) && r.principal.value > 0)
    .slice(0, NAMED_PLACES)
    .forEach((r) => {
      const f = features.get(r.id)!;
      const [px] = proj.point(f);
      const o = origin.get(r.id);
      labels.push({ key: `place:${r.id}`, kind: "place", x: px, y: (o?.y ?? proj.point(f)[1]) - 5, align: "middle", values: { code: r.id, name: f.name, value: r.principal.value } });
    });
  const rest = places.find((r) => r.id === NO_PLACE);
  if (rest && rest.principal.value > 0) {
    labels.push({ key: "noPlace", kind: "noPlace", x: 8, y: map.y + map.h + 14, align: "start", values: { value: rest.principal.value } });
  }
  return {
    squares,
    pitch,
    labels,
    targets: [],
    outlines: geo.features.map((f) => ({ code: f.code, d: proj.path(f) })),
    spine: 0,
    map,
    bands: [],
  };
}

export function layoutField(model: FieldModel, file: ContractsFile, stage: Stage, box: { w: number; h: number }, ctx: LayoutContext = {}): FieldLayout {
  const years = yearLayout(model, file, box, stage.kind !== "record");
  if (stage.kind === "record" || stage.kind === "purpose") return years;
  if (stage.kind === "areas" && ctx.rows) return areaLayout(model, file, stage.lens, box, ctx.rows, years);
  if (stage.kind === "places" && ctx.places && ctx.geo) return placeLayout(model, file, box, ctx.places, ctx.geo, years);
  return years;
}
