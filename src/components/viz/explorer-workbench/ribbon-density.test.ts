import { describe, expect, it } from "vitest";
import { ambientRibbonInk, RAMP_END, RAMP_START } from "./ribbon-density";

// Real corpus sizes the ramp has to serve (flagged pairs per country).
const COTE_DIVOIRE_FLAGGED = 128;
const SRI_LANKA_FLAGGED = 866;
const PANAMA_FLAGGED = 1172;

describe("ambientRibbonInk (default mode)", () => {
  it("matches the legacy ramp exactly so the default view is unchanged", () => {
    // Legacy: 0.25 at <= 50 edges, 0.03 at >= 1000, linear in between, width 1.
    expect(ambientRibbonInk(0, "default")).toEqual({ opacity: 0.25, strokeWidth: 1 });
    expect(ambientRibbonInk(RAMP_START, "default")).toEqual({ opacity: 0.25, strokeWidth: 1 });
    expect(ambientRibbonInk(RAMP_END, "default")).toEqual({ opacity: 0.03, strokeWidth: 1 });
    expect(ambientRibbonInk(5000, "default")).toEqual({ opacity: 0.03, strokeWidth: 1 });
    const mid = ambientRibbonInk(525, "default");
    expect(mid.opacity).toBeCloseTo(0.25 - 0.5 * 0.22, 5);
    expect(mid.strokeWidth).toBe(1);
  });
});

describe("ambientRibbonInk (flagged mode)", () => {
  it("keeps full presence for a small flagged set", () => {
    expect(ambientRibbonInk(0, "flagged")).toEqual({ opacity: 0.55, strokeWidth: 2 });
    expect(ambientRibbonInk(RAMP_START, "flagged")).toEqual({ opacity: 0.55, strokeWidth: 2 });
  });

  it("thins a large flagged set instead of drawing it at full ink", () => {
    const sl = ambientRibbonInk(SRI_LANKA_FLAGGED, "flagged");
    expect(sl.opacity).toBeLessThan(0.2);
    expect(sl.opacity).toBeGreaterThan(0.08);
    expect(sl.strokeWidth).toBe(1);
    expect(ambientRibbonInk(PANAMA_FLAGGED, "flagged")).toEqual({ opacity: 0.08, strokeWidth: 1 });
  });

  it("leaves a mid-sized flagged set readable", () => {
    const ci = ambientRibbonInk(COTE_DIVOIRE_FLAGGED, "flagged");
    expect(ci.opacity).toBeGreaterThan(0.45);
    expect(ci.strokeWidth).toBeGreaterThan(1.5);
    expect(ci.strokeWidth).toBeLessThan(2);
  });

  it("reaches width 1 by 400 edges", () => {
    expect(ambientRibbonInk(400, "flagged").strokeWidth).toBe(1);
  });
});

describe("ambientRibbonInk (both modes)", () => {
  it("never gets darker as the edge count grows", () => {
    for (const mode of ["default", "flagged"] as const) {
      let prev = ambientRibbonInk(0, mode);
      for (let n = 1; n <= 1500; n += 7) {
        const cur = ambientRibbonInk(n, mode);
        expect(cur.opacity).toBeLessThanOrEqual(prev.opacity + 1e-12);
        expect(cur.strokeWidth).toBeLessThanOrEqual(prev.strokeWidth + 1e-12);
        prev = cur;
      }
    }
  });

  it("gives dashed red at least the presence of the default ramp at every count", () => {
    for (const n of [0, 50, 128, 400, 866, 1172, 3000]) {
      expect(ambientRibbonInk(n, "flagged").opacity).toBeGreaterThanOrEqual(
        ambientRibbonInk(n, "default").opacity,
      );
    }
  });
});
