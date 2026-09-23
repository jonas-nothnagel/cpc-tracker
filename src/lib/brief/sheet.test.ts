import { describe, expect, it } from "vitest";
import { briefDate, fitLines } from "./sheet";

describe("briefDate", () => {
  const iso = "2026-09-23T10:00:00.000Z";

  it("dates English day first, as UNDP style asks", () => {
    expect(briefDate(iso, "en")).toBe("23 September 2026");
  });

  it("uses the Spanish long form", () => {
    expect(briefDate(iso, "es")).toBe("23 de septiembre de 2026");
  });

  it("spells the Mongolian date itself, the same in every browser", () => {
    expect(briefDate(iso, "mn")).toBe("2026 оны 9-р сарын 23");
  });
});

describe("fitLines", () => {
  it("fits as many whole lines as the space holds, up to the maximum", () => {
    expect(fitLines(100, 20, 4)).toBe(4);
    expect(fitLines(79, 20, 4)).toBe(3);
    expect(fitLines(41, 20, 4)).toBe(2);
  });

  it("keeps at least one line so the text never disappears", () => {
    expect(fitLines(5, 20, 4)).toBe(1);
    expect(fitLines(0, 20, 4)).toBe(1);
  });
});
