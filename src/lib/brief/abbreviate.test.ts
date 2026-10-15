import { describe, expect, it } from "vitest";
import { shortName } from "./abbreviate";

describe("shortName", () => {
  it("keeps a name that fits as it is", () => {
    expect(shortName("Water Security", "en")).toBe("Water Security");
    expect(shortName("Long-term development", "en", 30)).toBe("Long-term development");
  });

  it("writes long words in their standard short form, longest first, until the name fits", () => {
    // 25 characters: Government goes first (19), then Strategic (16).
    expect(shortName("Government Strategic Plan", "en")).toBe("Gov. Strat. Plan");
  });

  it("keeps a word's case", () => {
    expect(shortName("Land degradation targets", "en")).toBe("Land degr. targets");
  });

  it("never drops a word: a name with no short form left stays long", () => {
    expect(shortName("Science & Innovation Plan", "en")).toBe("Science & Innov. Plan");
  });

  it("uses the short forms of the page's language", () => {
    expect(shortName("Plan Estratégico de Gobierno", "es")).toBe("Plan Estrat. de Gob.");
    // No short forms are kept for Mongolian: the name is shown whole.
    expect(shortName("Газрын доройтлын зорилтууд", "mn")).toBe("Газрын доройтлын зорилтууд");
  });
});
