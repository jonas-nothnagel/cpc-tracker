import { describe, expect, it } from "vitest";
import { buildBriefSource, briefDocName } from "./source";

const CONFIG = {
  documentTypes: [
    {
      id: "NDC",
      shortLabel: "NDC",
      mediumLabel: "NDC (Climate)",
      fullLabel: "Nationally Determined Contribution (NDC 3.0)",
      color: "#0468b1",
    },
    {
      id: "NBSAP",
      shortLabel: "NBSAP",
      mediumLabel: "NBSAP",
      fullLabel: "National Biodiversity Strategy and Action Plan",
      color: "#0d9488",
    },
    {
      id: "FSS",
      shortLabel: "FSS",
      mediumLabel: "FSS",
      fullLabel: "Food Supply and Security Measures (Parliament Resolution 36, June 2022)",
      color: "#b45309",
    },
    {
      id: "LDNR",
      shortLabel: "NRVTS",
      mediumLabel: "LDN Targets",
      fullLabel:
        "National Report on Voluntary Target Setting to Achieve Land Degradation Neutrality in Mongolia",
      color: "#78716c",
    },
    { id: "BTR", shortLabel: "BTR", mediumLabel: "BTR", fullLabel: "Biennial Transparency Report", color: "#7c3aed" },
  ],
  defaultHiddenDocTypes: ["FSS"],
  secondaryDocTypes: ["LDNR"],
};

function target(id: string, sourceDocument: string) {
  return {
    id,
    text: `Text of ${id}`,
    sourceDocument,
    sourceLabel: `Label ${id}`,
    country: "Mongolia",
    isQuantitative: false,
    isTimeBound: false,
  };
}

const DATA = {
  countryConfig: CONFIG,
  targets: [
    target("FSS_1", "FSS"),
    target("NDC_1", "NDC"),
    target("NBSAP_1", "NBSAP"),
    target("NDC_2", "NDC"),
    target("LDNR_1", "LDNR"),
    target("BTR_1", "BTR"),
  ],
  alignment: [
    { targetAId: "NDC_1", targetBId: "NBSAP_1", alignment: "high", description: "" },
    {
      targetAId: "NBSAP_1",
      targetBId: "FSS_1",
      alignment: "flagged",
      mechanism: "resource_competition",
      description: "",
    },
    { targetAId: "NDC_2", targetBId: "FSS_1", alignment: "low", description: "" },
    { targetAId: "NDC_1", targetBId: "NDC_2", alignment: "medium", description: "" },
    { targetAId: "BTR_1", targetBId: "NDC_1", alignment: "flagged", description: "" },
    { targetAId: "GHOST_1", targetBId: "NDC_1", alignment: "high", description: "" },
  ],
  globeCategories: [
    { id: "g1", name: "Protected areas" },
    { id: "g2", name: "Agriculture" },
  ],
  sectors: [{ id: "s1", name: "Energy" }],
  ggaCategories: [],
  hrCategories: [],
  classifications: [
    { targetId: "NBSAP_1", categoryId: "g1", taxonomyType: "globe", isPrimary: true },
    { targetId: "FSS_1", categoryId: "g2", taxonomyType: "globe", isPrimary: false },
    { targetId: "BTR_1", categoryId: "s1", taxonomyType: "sector", isPrimary: true },
  ],
  corpusThemes: null,
  model: "gpt-5-4",
};

describe("briefDocName", () => {
  it("drops a trailing parenthetical from the full name", () => {
    expect(briefDocName(CONFIG.documentTypes[2])).toBe("Food Supply and Security Measures");
    expect(briefDocName(CONFIG.documentTypes[0])).toBe("Nationally Determined Contribution");
  });

  it("falls back to the medium label when the full name runs past 60 characters", () => {
    expect(briefDocName(CONFIG.documentTypes[3])).toBe("LDN Targets");
  });
});

describe("buildBriefSource", () => {
  const source = buildBriefSource({
    countryId: "mongolia",
    countryName: "Mongolia",
    data: DATA,
    locale: "en",
  });

  it("keeps policy commitments only, in document order", () => {
    expect(source.commitments.map((c) => c.id)).toEqual([
      "NDC_1",
      "NDC_2",
      "NBSAP_1",
      "FSS_1",
      "LDNR_1",
    ]);
    expect(source.commitments[0]).toEqual({
      id: "NDC_1",
      doc: "NDC",
      label: "Label NDC_1",
      text: "Text of NDC_1",
    });
  });

  it("encodes cross-document comparisons as [a, b, level, mechanism]", () => {
    // high = 0, low = 2, flagged = 4; resource_competition = 2
    expect(source.comparisons).toEqual([0, 2, 0, 0, 2, 3, 4, 2, 1, 3, 2, 0]);
  });

  it("lists documents in config order with counts and default visibility", () => {
    expect(
      source.documents.map((d) => [d.id, d.code, d.name, d.count, d.defaultOn]),
    ).toEqual([
      ["NDC", "NDC", "Nationally Determined Contribution", 2, true],
      ["NBSAP", "NBSAP", "National Biodiversity Strategy and Action Plan", 1, true],
      ["FSS", "FSS", "Food Supply and Security Measures", 1, false],
      ["LDNR", "NRVTS", "LDN Targets", 1, false],
    ]);
  });

  it("offers a lens only when a brief commitment has a primary classification in it", () => {
    expect(source.lenses.map((l) => l.id)).toEqual(["globe"]);
    expect(source.lenses[0].primary).toEqual({ NBSAP_1: "g1" });
    expect(source.lenses[0].categories).toEqual([
      { id: "g1", name: "Protected areas" },
      { id: "g2", name: "Agriculture" },
    ]);
  });

  it("carries the country and the model", () => {
    expect(source.countryId).toBe("mongolia");
    expect(source.countryName).toBe("Mongolia");
    expect(source.model).toBe("gpt-5-4");
    expect(source.themes).toBeNull();
  });
});

describe("buildBriefSource translation flags", () => {
  function sourceWith(target: Record<string, unknown>, locale: string) {
    return buildBriefSource({
      countryId: "x",
      countryName: "X",
      data: { ...DATA, targets: [target, target_("NBSAP_1", "NBSAP")], alignment: [] },
      locale,
    });
  }
  function target_(id: string, doc: string) {
    return { id, text: `Text of ${id}`, sourceDocument: doc, sourceLabel: id, country: "X", isQuantitative: false, isTimeBound: false };
  }

  it("marks machine back-translations shown in the page language", () => {
    const t = { ...target_("NDC_1", "NDC"), textOriginal: "Монгол", language: "mn", textOriginalSource: "machine" };
    expect(sourceWith(t, "mn").commitments[0]).toMatchObject({ text: "Монгол", translated: "machine" });
    expect(sourceWith(t, "en").commitments[0].translated).toBeUndefined();
  });

  it("marks text shown in translation when the original is in another language", () => {
    const t = { ...target_("NDC_1", "NDC"), textOriginal: "Texto original", language: "es", textOriginalSource: "source" };
    expect(sourceWith(t, "en").commitments[0].translated).toBe("translation");
  });

  it("does not mark text already swapped onto its source language", () => {
    const swapped = {
      ...target_("NDC_1", "NDC"),
      text: "Texto original",
      textOriginal: "Texto original",
      textTranslation: "Text of NDC_1",
      textLocale: "es",
      language: "es",
      textOriginalSource: "source",
    };
    expect(sourceWith(swapped, "es").commitments[0].translated).toBeUndefined();
  });
});

describe("buildBriefSource pair notes", () => {
  function synthesis(a: string, b: string, error: string | null = null) {
    return {
      doc_a: a,
      doc_b: b,
      label_a: a,
      label_b: b,
      aligned_count: 3,
      flagged_count: 1,
      contradiction_types: {},
      synthesis: {
        storyline_name: `${a} and ${b} on land`,
        reinforce: "Both expand restoration. They also share monitoring.",
        clash: "Cropland expansion may compete with protected areas.",
        coordination_hint: "Joint land-use screening could help.",
        confidence: "high",
      },
      synthesis_error: error,
    };
  }

  it("carries each pair of documents' AI synthesis and skips failed ones", () => {
    const source = buildBriefSource({
      countryId: "mongolia",
      countryName: "Mongolia",
      locale: "en",
      data: {
        ...DATA,
        docPairSynthesis: [synthesis("NDC", "NBSAP"), synthesis("NDC", "FSS", "timeout")],
      },
    });
    expect(source.pairNotes).toEqual([
      {
        a: "NDC",
        b: "NBSAP",
        title: "NDC and NBSAP on land",
        align: "Both expand restoration. They also share monitoring.",
        diverge: "Cropland expansion may compete with protected areas.",
        hint: "Joint land-use screening could help.",
      },
    ]);
  });

  it("has no pair notes when the pipeline wrote none", () => {
    const source = buildBriefSource({ countryId: "x", countryName: "X", locale: "en", data: DATA });
    expect(source.pairNotes).toEqual([]);
  });
});

