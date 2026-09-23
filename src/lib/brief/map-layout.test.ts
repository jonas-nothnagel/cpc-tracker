import { describe, expect, it } from "vitest";
import { cellOrigin, layoutMap, type MapBlock } from "./map-layout";

function overlaps(p: MapBlock, q: MapBlock): boolean {
  return p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
}

const SRI_LANKA = [91, 16, 4, 192, 4, 33, 9, 55].map((count, i) => ({ id: `D${i}`, count }));

describe("layoutMap", () => {
  it("keeps every block inside the width and never overlaps two blocks", () => {
    const layout = layoutMap(SRI_LANKA, 673, 600);
    for (const b of layout.blocks) {
      expect(b.x + b.width).toBeLessThanOrEqual(673);
    }
    for (const [i, p] of layout.blocks.entries()) {
      for (const q of layout.blocks.slice(i + 1)) expect(overlaps(p, q)).toBe(false);
    }
  });

  it("fits 404 commitments in the height given, with room for every cell", () => {
    const layout = layoutMap(SRI_LANKA, 673, 600);
    expect(layout.height).toBeLessThanOrEqual(600);
    expect(layout.cell).toBeGreaterThanOrEqual(6);
    for (const b of layout.blocks) expect(b.cols * b.rows).toBeGreaterThanOrEqual(b.count);
  });

  it("uses the largest cell that fits, up to the maximum", () => {
    expect(layoutMap([{ id: "A", count: 4 }], 673, 600).cell).toBe(18);
    const tight = layoutMap(SRI_LANKA, 673, 600);
    expect(layoutMap(SRI_LANKA, 673, 600, { maxCell: tight.cell + 1 }).cell).toBe(tight.cell);
  });

  it("leaves out documents without commitments and keeps document order", () => {
    const layout = layoutMap(
      [
        { id: "A", count: 3 },
        { id: "B", count: 0 },
        { id: "C", count: 2 },
      ],
      673,
      600,
    );
    expect(layout.blocks.map((b) => b.doc)).toEqual(["A", "C"]);
  });

  it("gives every block room for its two-line name", () => {
    const layout = layoutMap([{ id: "A", count: 1 }], 673, 600);
    expect(layout.blocks[0].width).toBeGreaterThanOrEqual(120);
  });
});

describe("cellOrigin", () => {
  it("fills a block row by row under its label", () => {
    const layout = layoutMap([{ id: "A", count: 9 }], 673, 600);
    const block = layout.blocks[0];
    const pitch = layout.cell + layout.gap;
    expect(cellOrigin(layout, block, 0)).toEqual({ x: block.x, y: block.y + layout.labelHeight });
    expect(cellOrigin(layout, block, block.cols + 1)).toEqual({
      x: block.x + pitch,
      y: block.y + layout.labelHeight + pitch,
    });
  });
});
