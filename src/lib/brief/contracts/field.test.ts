import { describe, expect, it } from "vitest";
import { areaRows } from "./areas";
import { buildField, layoutField, type FieldLayout } from "./field";
import { fitProjection, type GeoFile } from "./geo";
import { NO_PLACE } from "./model";
import { placeRows } from "./places";
import { briefSide, contractsFixture } from "./test-fixture";

const file = contractsFixture();
const side = briefSide();
const model = buildField(file);
const box = { w: 800, h: 500 };
const rows = areaRows(file.contracts, "globe", side.categories, side.primary, side.targets.map((t) => t.id));
const places = placeRows(file.contracts);

const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];
export const GEO: GeoFile = {
  source: "test",
  features: [
    { code: "MN-043", name: "Khovd", point: [91, 47], rings: [square(90, 46, 92, 48)] },
    { code: "MN-057", name: "Zavkhan", point: [96, 48], rings: [square(95, 47, 97, 49)] },
    { code: "MN-1", name: "Ulaanbaatar", point: [106.5, 47.5], rings: [square(106, 47, 107, 48)] },
  ],
};

const ctx = { rows, places, geo: GEO };
const lay = (stage: Parameters<typeof layoutField>[2]): FieldLayout => layoutField(model, file, stage, box, ctx);

describe("buildField", () => {
  it("cuts the whole record into squares, the green ones first", () => {
    expect(model.inks).toHaveLength(50);
    expect(model.inks.filter((i) => i === "principal")).toHaveLength(4);
    expect(model.inks.filter((i) => i === "significant")).toHaveLength(3);
    expect(model.inks.slice(0, 4).every((i) => i === "principal")).toBe(true);
  });
});

describe("layoutField", () => {
  it("keeps every square in every step", () => {
    for (const stage of [{ kind: "record" }, { kind: "purpose" }, { kind: "areas", lens: "globe" }, { kind: "places" }] as const) {
      expect(lay(stage).squares).toHaveLength(50);
    }
  });

  it("keeps the record inside the field", () => {
    for (const s of lay({ kind: "record" }).squares) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(box.w);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(box.h);
    }
  });

  it("stacks each year from the bottom: mainly for nature or climate, side benefit, the rest", () => {
    const l = lay({ kind: "purpose" });
    const year2025 = l.squares.map((s, i) => ({ s, ink: model.inks[i], year: model.years[i] })).filter((q) => q.year === 2025);
    const lowest = (ink: string) => Math.max(...year2025.filter((q) => q.ink === ink).map((q) => q.s.y));
    const highest = (ink: string) => Math.min(...year2025.filter((q) => q.ink === ink).map((q) => q.s.y));
    expect(lowest("principal")).toBeGreaterThanOrEqual(lowest("significant"));
    expect(highest("significant")).toBeGreaterThanOrEqual(highest("rest"));
  });

  it("labels each year, its value on the record and its share for nature or climate", () => {
    expect(lay({ kind: "record" }).labels.filter((l) => l.kind === "columnValue")).toHaveLength(2);
    const share = lay({ kind: "purpose" }).labels.find((l) => l.kind === "columnShare" && l.values.year === 2024);
    expect(share?.values.share).toBeCloseTo(14 / 100);
  });

  it("shows only the money mainly for nature or climate by area, its squares right of the spine and targets left", () => {
    const l = lay({ kind: "areas", lens: "globe" });
    const visible = l.squares.filter((s) => s.visible);
    expect(visible).toHaveLength(4);
    expect(visible.every((s) => s.x > l.spine)).toBe(true);
    expect(l.targets).toHaveLength(6);
    expect(l.targets.every((t) => t.x < l.spine)).toBe(true);
    expect(l.labels.filter((x) => x.kind === "rowName")).toHaveLength(rows.length);
  });

  it("keeps an area that has targets but no money: a named row, no squares, value 0", () => {
    const withAbs = areaRows(file.contracts, "globe", side.categories, { ...side.primary, C2: "g_abs" }, side.targets.map((t) => t.id));
    const abs = withAbs.find((r) => r.id === "g_abs");
    expect(abs?.targets).toEqual(["C2"]);
    expect(abs?.principal.value).toBe(0);
    const l = layoutField(model, file, { kind: "areas", lens: "globe" }, box, { rows: withAbs, places, geo: GEO });
    expect(l.labels.find((x) => x.kind === "rowName" && x.values.id === "g_abs")).toBeDefined();
    expect(l.labels.find((x) => x.kind === "rowValue" && x.values.id === "g_abs")?.values.value).toBe(0);
    expect(l.squares.filter((q) => q.visible && q.slice?.cell === "g_abs")).toHaveLength(0);
    expect(l.squares.filter((q) => q.visible)).toHaveLength(4);
  });

  it("piles each place's squares on its point, the unnamed below the map", () => {
    const l = lay({ kind: "places" });
    const visible = l.squares.map((s) => ({ s, slice: s.slice })).filter((q) => q.s.visible);
    expect(visible).toHaveLength(4);
    const proj = fitProjection(GEO, l.map!);
    const [kx, ky] = proj.point(GEO.features[0]);
    const khovd = visible.filter((q) => q.slice?.cell === "MN-043").map((q) => q.s);
    const cx = khovd.reduce((s, q) => s + q.x, 0) / khovd.length;
    const cy = khovd.reduce((s, q) => s + q.y, 0) / khovd.length;
    expect(Math.abs(cx - kx)).toBeLessThanOrEqual(l.pitch);
    expect(Math.abs(cy - ky)).toBeLessThanOrEqual(l.pitch);
    const rest = visible.filter((q) => q.slice?.cell === NO_PLACE).map((q) => q.s);
    expect(rest.every((q) => q.y > l.map!.y + l.map!.h)).toBe(true);
    expect(l.outlines).toHaveLength(3);
  });
});

describe("fitProjection", () => {
  it("keeps every point inside the box", () => {
    const b = { x: 10, y: 20, w: 300, h: 200 };
    const p = fitProjection(GEO, b);
    for (const f of GEO.features) {
      for (const ring of f.rings) {
        for (const [lon, lat] of ring) {
          expect(p.x(lon)).toBeGreaterThanOrEqual(b.x - 1e-6);
          expect(p.x(lon)).toBeLessThanOrEqual(b.x + b.w + 1e-6);
          expect(p.y(lat)).toBeGreaterThanOrEqual(b.y - 1e-6);
          expect(p.y(lat)).toBeLessThanOrEqual(b.y + b.h + 1e-6);
        }
      }
    }
    expect(p.path(GEO.features[0]).startsWith("M")).toBe(true);
  });
});
