import { describe, expect, it } from "vitest";
import {
  buildTargetHaystack,
  matchesTargetQuery,
  normaliseForSearch,
} from "./text-search";
import type { Target } from "@/types";

function makeTarget(overrides: Partial<Target> = {}): Target {
  return {
    id: "T1",
    text: "Increase forest cover from 29% to 32%",
    sourceDocument: "LDN",
    sourceLabel: "Target 1",
    country: "Mongolia",
    isQuantitative: true,
    isTimeBound: false,
    ...overrides,
  };
}

describe("normaliseForSearch", () => {
  it("strips Spanish and French accents", () => {
    expect(normaliseForSearch("Reducción")).toBe("reduccion");
    expect(normaliseForSearch("Côtière")).toBe("cotiere");
    expect(normaliseForSearch("gestión integrada")).toBe("gestion integrada");
  });

  it("lowercases Cyrillic without altering the letters", () => {
    expect(normaliseForSearch("ХӨДӨӨ АЖ АХУЙ")).toBe("хөдөө аж ахуй");
  });

  it("keeps Cyrillic Й and Ё intact, which are letters and not accents", () => {
    // Both decompose under NFD; folding them would merge й into и and ё into е.
    expect(normaliseForSearch("ОЙ")).toBe("ой");
    expect(normaliseForSearch("ОЙ")).not.toBe("ои");
    expect(normaliseForSearch("ЁЛКА")).toBe("ёлка");
  });

  it("leaves plain ASCII and punctuation alone", () => {
    expect(normaliseForSearch("Increase 30% by 2030")).toBe(
      "increase 30% by 2030",
    );
  });
});

describe("buildTargetHaystack", () => {
  it("includes every searchable field", () => {
    const haystack = buildTargetHaystack(
      makeTarget({
        sourceLabel: "Goal 4",
        text: "Restore degraded land",
        textOriginal: "Доройтсон газрыг нөхөн сэргээх",
        sourceLabelOriginal: "Зорилт 4",
        activities: "4.1 Replant native species",
        actions: "Issue land-use guidance",
      }),
    );
    for (const fragment of [
      "goal 4",
      "restore degraded land",
      "доройтсон",
      "зорилт 4",
      "replant native species",
      "issue land-use guidance",
    ]) {
      expect(haystack).toContain(fragment);
    }
  });

  it("never emits the literal 'undefined' for absent fields", () => {
    expect(buildTargetHaystack(makeTarget())).not.toContain("undefined");
  });
});

describe("matchesTargetQuery", () => {
  const haystack = buildTargetHaystack(
    makeTarget({
      sourceLabel: "Meta 3.2",
      text: "Reduce emissions from transport by 2030",
      textOriginal: "Reducción de emisiones del transporte para 2030",
      language: "es",
    }),
  );

  it("matches everything on an empty or whitespace query", () => {
    expect(matchesTargetQuery(haystack, "")).toBe(true);
    expect(matchesTargetQuery(haystack, "   ")).toBe(true);
  });

  it("matches on the reference label alone", () => {
    expect(matchesTargetQuery(haystack, "3.2")).toBe(true);
  });

  it("matches the original language when the English text lacks the term", () => {
    expect(haystack).not.toContain("emisiones del transporte para 2030 reduce");
    expect(matchesTargetQuery(haystack, "emisiones")).toBe(true);
  });

  it("matches an accented word typed without accents", () => {
    expect(matchesTargetQuery(haystack, "reduccion")).toBe(true);
  });

  it("requires every token, in any order", () => {
    expect(matchesTargetQuery(haystack, "transport 2030")).toBe(true);
    expect(matchesTargetQuery(haystack, "2030 transport")).toBe(true);
    expect(matchesTargetQuery(haystack, "transport forest")).toBe(false);
  });

  it("ignores surrounding whitespace", () => {
    expect(matchesTargetQuery(haystack, "  transport  ")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(matchesTargetQuery(haystack, "TRANSPORT")).toBe(true);
  });

  it("matches punctuation literally", () => {
    const quantitative = buildTargetHaystack(
      makeTarget({ text: "Cut losses by 30% before 2035" }),
    );
    expect(matchesTargetQuery(quantitative, "30%")).toBe(true);
    expect(matchesTargetQuery(quantitative, "40%")).toBe(false);
  });
});
