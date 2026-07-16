import { describe, expect, it } from "vitest";
import { cutoutRect, placeTooltip, type Rect, type Size } from "./geometry";

const VIEWPORT: Size = { width: 1280, height: 800 };
const CARD: Size = { width: 320, height: 160 };

function rect(top: number, left: number, width: number, height: number): Rect {
  return { top, left, width, height };
}

describe("cutoutRect", () => {
  it("expands the target rect by the padding on every side", () => {
    expect(cutoutRect(rect(100, 200, 50, 40), 8)).toEqual({
      top: 92,
      left: 192,
      width: 66,
      height: 56,
    });
  });

  it("handles zero-size rects without producing NaN", () => {
    const r = cutoutRect(rect(0, 0, 0, 0), 8);
    expect(r).toEqual({ top: -8, left: -8, width: 16, height: 16 });
  });
});

describe("placeTooltip", () => {
  it("prefers below the spotlight when there is room", () => {
    const pos = placeTooltip(rect(100, 400, 200, 100), CARD, VIEWPORT);
    expect(pos.placement).toBe("bottom");
    expect(pos.top).toBe(100 + 100 + 12);
    // Horizontally centred on the spotlight.
    expect(pos.left).toBe(400 + 100 - CARD.width / 2);
  });

  it("flips above when the spotlight sits near the bottom edge", () => {
    const pos = placeTooltip(rect(700, 400, 200, 90), CARD, VIEWPORT);
    expect(pos.placement).toBe("top");
    expect(pos.top).toBe(700 - CARD.height - 12);
  });

  it("falls back to the roomiest side when neither vertical side fits", () => {
    // Tall spotlight filling most of the viewport height, hugging the left.
    const pos = placeTooltip(rect(50, 10, 300, 700), CARD, VIEWPORT);
    expect(pos.placement).toBe("right");
  });

  it("clamps horizontally so the card stays inside the viewport", () => {
    // Spotlight at the far left: centring would push the card off-screen.
    const pos = placeTooltip(rect(100, 0, 40, 40), CARD, VIEWPORT);
    expect(pos.left).toBeGreaterThanOrEqual(12);
    // And at the far right.
    const pos2 = placeTooltip(rect(100, 1240, 40, 40), CARD, VIEWPORT);
    expect(pos2.left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width - 12);
  });

  it("respects an explicit preferred placement when it fits", () => {
    const pos = placeTooltip(rect(300, 600, 100, 100), CARD, VIEWPORT, "left");
    expect(pos.placement).toBe("left");
    expect(pos.left).toBe(600 - CARD.width - 12);
  });

  it("keeps a degenerate zero-size spotlight on screen", () => {
    const pos = placeTooltip(rect(0, 0, 0, 0), CARD, VIEWPORT);
    expect(pos.top).toBeGreaterThanOrEqual(12);
    expect(pos.left).toBeGreaterThanOrEqual(12);
  });
});
