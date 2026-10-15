import { describe, expect, it } from "vitest";
import { leadingStep } from "./lead";

const tops = (record: number, purpose: number, places: number, areas: number) => [
  { step: "record", top: record },
  { step: "purpose", top: purpose },
  { step: "places", top: places },
  { step: "areas", top: areas },
];

describe("which step leads the field", () => {
  it("is the last step whose top has passed the line", () => {
    expect(leadingStep(tops(-2000, -900, 250, 1400), 300)).toBe("places");
  });

  it("stays with a long step while the next is still below the line, even past the middle", () => {
    // The map's step runs on past the middle of a 1000px window; the areas step starts at 450.
    expect(leadingStep(tops(-2000, -1200, -600, 450), 300)).toBe("places");
  });

  it("is none before the first step reaches the line", () => {
    expect(leadingStep(tops(500, 1300, 2100, 2900), 300)).toBeNull();
  });
});
