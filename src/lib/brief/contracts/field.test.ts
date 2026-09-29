import { describe, expect, it } from "vitest";
import { buildField, layoutField, placeLabels, resolveBlocks, type AreaRowB, type FieldLayout, type LayoutContext, type Stage } from "./field";
import { fitProjection, type GeoFile } from "./geo";
import { NO_PLACE } from "./model";
import { contractsFixture } from "./test-fixture";

const file = contractsFixture();
const model = buildField(file);
const box = { w: 800, h: 500 };

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
  band: ["MN-1"],
};

// Policy areas as the page sorts them: by money mainly for nature or climate, "none" last.
const rows: AreaRowB[] = [
  { id: "g_pollution", name: "Pollution management", value: 10e9, targets: [{ id: "B2", matched: true }] },
  { id: "g_restoration", name: "Restoration", value: 8e9, targets: [{ id: "B1", matched: true }] },
  { id: "g_sustainable", name: "Sustainable use", value: 2e9, targets: ["A1", "A2", "C1"].map((id) => ({ id, matched: true })) },
  { id: "none", name: "", value: 2e9, targets: [{ id: "C2", matched: false }] },
];
const ctx: LayoutContext = { rows, geo: GEO };
const lay = (stage: Stage, extra: Partial<LayoutContext> = {}): FieldLayout => layoutField(model, file, stage, box, { ...ctx, ...extra });
const visible = (l: FieldLayout) => l.squares.filter((s) => s.visible);

describe("buildField", () => {
  it("cuts the whole record into squares, the green ones first", () => {
    expect(model.inks).toHaveLength(50);
    expect(model.inks.filter((i) => i === "principal")).toHaveLength(4);
    expect(model.inks.filter((i) => i === "significant")).toHaveLength(3);
    expect(model.inks.slice(0, 4).every((i) => i === "principal")).toBe(true);
  });
});

describe("the steps", () => {
  const stages: Stage[] = [
    { kind: "record" },
    { kind: "purpose", key: "" },
    { kind: "places", layer: "money", key: "" },
    { kind: "places", layer: "all", key: "" },
    { kind: "places", layer: "match", key: "" },
    { kind: "areas", lens: "globe", key: "" },
  ];

  it("keeps every square in every step, so the squares can move", () => {
    for (const stage of stages) expect(lay(stage).squares).toHaveLength(50);
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
    const l = lay({ kind: "purpose", key: "" });
    const y25 = l.squares.map((s, i) => ({ s, ink: model.inks[i], year: model.years[i] })).filter((q) => q.year === 2025);
    const lowest = (ink: string) => Math.max(...y25.filter((q) => q.ink === ink).map((q) => q.s.y));
    const highest = (ink: string) => Math.min(...y25.filter((q) => q.ink === ink).map((q) => q.s.y));
    expect(lowest("principal")).toBeGreaterThanOrEqual(lowest("significant"));
    expect(highest("significant")).toBeGreaterThanOrEqual(highest("rest"));
  });

  it("labels each year, its value on the record and its share for nature or climate", () => {
    expect(lay({ kind: "record" }).labels.filter((l) => l.kind === "columnValue")).toHaveLength(2);
    const share = lay({ kind: "purpose", key: "" }).labels.find((l) => l.kind === "columnShare" && l.values.year === 2024);
    expect(share?.values.share).toBeCloseTo(14 / 100);
  });

  it("keeps the focus's squares in each year's colour and turns the year's other green money light", () => {
    const l = lay({ kind: "purpose", key: "f" }, { yearFocus: { squares: [1, 0], values: [5e9, 0] } });
    const principal = l.squares.map((s, i) => ({ s, year: model.years[i], ink: model.inks[i] })).filter((q) => q.ink === "principal");
    const y24 = principal.filter((q) => q.year === 2024);
    expect(y24.filter((q) => (q.s.ink ?? "principal") === "principal")).toHaveLength(1);
    expect(y24.filter((q) => q.s.ink === "significant")).toHaveLength(y24.length - 1);
    expect(principal.filter((q) => q.year === 2025).every((q) => q.s.ink === "significant")).toBe(true);
    expect(l.labels.find((x) => x.kind === "columnFocus" && x.values.year === 2024)?.values.value).toBe(5e9);
    expect(l.labels.some((x) => x.kind === "columnShare")).toBe(false);
  });
});

describe("the map", () => {
  it("gathers the money mainly for nature or climate by place, the capital and the unnamed in the band below", () => {
    const l = lay({ kind: "places", layer: "money", key: "" });
    expect(visible(l)).toHaveLength(4);
    expect(l.map).not.toBeNull();
    const bandTop = l.map!.y + l.map!.h;
    const khovd = l.blocks.find((b) => b.code === "MN-043")!;
    const [kx, ky] = fitProjection(GEO, l.map!).point(GEO.features[0]);
    expect(Math.abs(khovd.x + khovd.w / 2 - kx)).toBeLessThanOrEqual(l.pitch * 2);
    expect(Math.abs(khovd.y + khovd.h / 2 - ky)).toBeLessThanOrEqual(l.pitch * 2);
    for (const code of ["MN-1", NO_PLACE]) {
      const b = l.blocks.find((q) => q.code === code);
      if (b && b.n > 0) expect(b.y).toBeGreaterThanOrEqual(bandTop);
    }
    expect(l.outlines).toHaveLength(3);
    expect(l.overlay).toBeNull();
  });

  it("keeps a line from the capital's point to its block in the band", () => {
    const l = lay({ kind: "places", layer: "all", key: "" });
    expect(l.leaders.some((q) => q.code === "MN-1")).toBe(true);
  });

  it("shows the whole record by place for All contracts, every square in ink", () => {
    const l = lay({ kind: "places", layer: "all", key: "" });
    expect(visible(l)).toHaveLength(50);
    const n = (code: string) => l.blocks.find((b) => b.code === code)?.n;
    expect([n(NO_PLACE), n("MN-1"), n("MN-043"), n("MN-057")]).toEqual([30, 12, 6, 2]);
  });

  it("draws a focus's money as finer squares over the map, the record's squares set aside", () => {
    const overlay = { shape: "square" as const, ink: "principal" as const, unit: 1e9, cells: [{ id: "MN-043", n: 4 }, { id: "MN-1", n: 4 }] };
    const l = lay({ kind: "places", layer: "money", key: "restoration" }, { overlay });
    expect(visible(l)).toHaveLength(0);
    expect(l.overlay?.marks).toHaveLength(8);
    expect(l.overlay?.marks.every((m) => m.shape === "square")).toBe(true);
  });

  it("draws one dot per tender for the tender layers", () => {
    const overlay = { shape: "dot" as const, ink: "mis" as const, unit: 1, cells: [{ id: NO_PLACE, n: 1 }, { id: "MN-1", n: 1 }] };
    const l = lay({ kind: "places", layer: "mis", key: "" }, { overlay });
    expect(visible(l)).toHaveLength(0);
    expect(l.overlay?.marks.map((m) => m.ink)).toEqual(["mis", "mis"]);
  });

  it("never lets two places' blocks overlap, nor leave the map", () => {
    const bounds = { x: 0, y: 0, w: 200, h: 120 };
    const out = resolveBlocks(
      [
        { code: "a", x: 50, y: 50, w: 30, h: 30 },
        { code: "b", x: 60, y: 55, w: 30, h: 30 },
        { code: "c", x: 190, y: 110, w: 20, h: 20 },
      ],
      bounds,
      3,
    );
    for (let i = 0; i < out.length; i++) {
      const a = out[i];
      expect(a.x).toBeGreaterThanOrEqual(bounds.x);
      expect(a.x + a.w).toBeLessThanOrEqual(bounds.x + bounds.w);
      expect(a.y + a.h).toBeLessThanOrEqual(bounds.y + bounds.h);
      for (let j = i + 1; j < out.length; j++) {
        const b = out[j];
        const apart = a.x + a.w + 3 <= b.x + 1e-6 || b.x + b.w + 3 <= a.x + 1e-6 || a.y + a.h + 3 <= b.y + 1e-6 || b.y + b.h + 3 <= a.y + 1e-6;
        expect(apart).toBe(true);
      }
    }
  });

  it("places names clear of each other and of the blocks, or not at all", () => {
    const blocks = [{ x: 90, y: 40, w: 20, h: 20 }];
    const items = [
      { key: "a", w: 60, h: 20, around: { x: 90, y: 40, w: 20, h: 20 } },
      { key: "b", w: 60, h: 20, around: { x: 90, y: 40, w: 20, h: 20 } },
      { key: "c", w: 500, h: 20, around: { x: 90, y: 40, w: 20, h: 20 } },
    ];
    const out = placeLabels(items, blocks, { x: 0, y: 0, w: 200, h: 100 });
    const a = out.get("a")!;
    const b = out.get("b")!;
    expect(a && b).toBeTruthy();
    const overlap = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }) =>
      p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
    expect(overlap(a, b)).toBe(false);
    expect(overlap(a, blocks[0])).toBe(false);
    expect(out.get("c")).toBeNull();
  });
});

describe("the policy areas", () => {
  it("lines each area's money up in one row of squares, the targets from 61% of the width", () => {
    const l = lay({ kind: "areas", lens: "globe", key: "" });
    const shown = visible(l);
    expect(shown).toHaveLength(4);
    const byRow = new Map<string, Set<number>>();
    for (const s of shown) byRow.set(String(s.slice?.cell), (byRow.get(String(s.slice?.cell)) ?? new Set()).add(Math.round(s.y)));
    for (const ys of byRow.values()) expect(ys.size).toBe(1);
    expect(l.targets).toHaveLength(6);
    expect(l.targets.every((t) => t.x >= box.w * 0.61)).toBe(true);
    expect(l.targets.find((t) => t.id === "C2")?.ink).toBe("targetNone");
    expect(l.labels.filter((x) => x.kind === "rowName").map((x) => x.values.id)).toEqual(rows.map((r) => r.id));
  });

  it("keeps an area with targets but no money: a named row, no squares, value 0", () => {
    const withAbs: AreaRowB[] = [...rows.slice(0, 3), { id: "g_abs", name: "Access and benefit sharing", value: 0, targets: [{ id: "C2", matched: false }] }];
    const l = lay({ kind: "areas", lens: "globe", key: "" }, { rows: withAbs });
    expect(l.labels.find((x) => x.kind === "rowValue" && x.values.id === "g_abs")?.values.value).toBe(0);
    expect(l.squares.filter((q) => q.visible && q.slice?.cell === "g_abs")).toHaveLength(0);
  });

  it("draws a document's or a place's money per area as finer squares", () => {
    const overlay = { shape: "square" as const, ink: "principal" as const, unit: 1e9, cells: [{ id: "g_pollution", n: 10 }, { id: "g_restoration", n: 4 }] };
    const l = lay({ kind: "areas", lens: "globe", key: "doc" }, { overlay });
    expect(visible(l)).toHaveLength(0);
    expect(l.overlay?.marks).toHaveLength(14);
    const ys = new Set(l.overlay!.marks.filter((m) => m.cell === "g_pollution").map((m) => Math.round(m.y)));
    expect(ys.size).toBe(1);
  });
});
