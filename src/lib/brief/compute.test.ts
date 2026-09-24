import { describe, expect, it } from "vitest";
import {
  strongConcentration,
  mechanismMix,
  strongestAlignments,
  alignedTargets,
  areaRows,
  commitmentsToReview,
  docStats,
  docToneShares,
  concentrationOf,
  docPairStats,
  leadingPair,
  overallLead,
  partnersOf,
  scopeOf,
  shareStep,
  themeExample,
  themeRows,
  toneCounts,
  toneOf,
  type DocPairStat,
} from "./compute";
import type { BriefCommitment, BriefDocument, BriefSource } from "./source";
import { briefFixture } from "./test-fixture";
import type { CorpusStoryline } from "@/types";

function doc(id: string): BriefDocument {
  return { id, code: id, name: `Document ${id}`, full: id, color: "#000", count: 0, defaultOn: true };
}

function commitment(id: string): BriefCommitment {
  return { id, doc: id[0], label: `Label ${id}`, text: `Text ${id}` };
}

// Level codes: high 0, medium 1, low 2, none 3, flagged 4.
// Mechanism codes: none 0, goal_conflict 1, resource_competition 2, delivery_friction 3.
const IDS = ["A1", "A2", "A3", "B1", "B2", "C1", "C2"];
const I = Object.fromEntries(IDS.map((id, i) => [id, i]));
const ROWS: [string, string, number, number][] = [
  ["A1", "B1", 0, 0],
  ["A1", "B2", 1, 0],
  ["A2", "B1", 2, 0],
  ["A2", "B2", 4, 1],
  ["A3", "B1", 3, 0],
  ["B2", "A3", 1, 0], // stored the other way round
  ["A1", "C1", 0, 0],
  ["A1", "C2", 0, 0],
  ["A2", "C1", 1, 0],
  ["A2", "C2", 2, 0],
  ["A3", "C1", 4, 2],
  ["A3", "C2", 4, 3],
  ["B1", "C1", 2, 0],
  ["B1", "C2", 2, 0],
  ["B2", "C1", 1, 0],
  ["C2", "B2", 4, 2], // stored the other way round
];

const SOURCE: BriefSource = {
  countryId: "testland",
  countryName: "Testland",
  commitments: IDS.map(commitment),
  documents: [doc("A"), doc("B"), doc("C")],
  comparisons: ROWS.flatMap(([a, b, level, mech]) => [I[a], I[b], level, mech]),
  lenses: [],
  themes: null,
  model: null,
};

describe("toneOf", () => {
  it("groups the five levels into four tones", () => {
    expect(["high", "medium", "low", "none", "flagged"].map((l) => toneOf(l as never))).toEqual([
      "reinforce",
      "reinforce",
      "partial",
      "none",
      "apart",
    ]);
  });
});

describe("scopeOf", () => {
  it("keeps only commitments and comparisons inside the selected documents", () => {
    const scope = scopeOf(SOURCE, ["A", "B"]);
    expect(scope.docs.map((d) => d.id)).toEqual(["A", "B"]);
    expect(scope.commitments.map((c) => c.id)).toEqual(["A1", "A2", "A3", "B1", "B2"]);
    expect(scope.comparisons).toHaveLength(6);
    expect(scope.hiddenDocs).toEqual(["C"]);
  });

  it("builds lite alignment rows and targets for the shared helpers", () => {
    const scope = scopeOf(SOURCE, ["A", "B"]);
    expect(scope.alignment[0]).toEqual({
      targetAId: "A1",
      targetBId: "B1",
      alignment: "high",
      description: "",
    });
    expect(scope.alignment[3]).toEqual({
      targetAId: "A2",
      targetBId: "B2",
      alignment: "flagged",
      mechanism: "goal_conflict",
      description: "",
    });
    expect(scope.targets[3]).toMatchObject({ id: "B1", sourceDocument: "B", sourceLabel: "Label B1" });
  });
});

describe("toneCounts", () => {
  it("counts every comparison once", () => {
    expect(toneCounts(scopeOf(SOURCE, ["A", "B", "C"]).comparisons)).toEqual({
      reinforce: 7,
      partial: 4,
      apart: 4,
      none: 1,
      total: 16,
    });
  });
});

describe("overallLead", () => {
  const counts = (reinforce: number, partial: number, apart: number, none = 0) => ({
    reinforce,
    partial,
    apart,
    none,
    total: reinforce + partial + apart + none,
  });

  it("leads with alignment when aligned comparisons outnumber partial ones", () => {
    expect(overallLead(counts(66, 29, 5))).toBe("aligned");
  });

  it("leads with partial alignment when partial links are the larger group (Sri Lanka)", () => {
    // Sri Lanka's default brief: 42% aligned, 55% partial, 1.5% potential misalignment.
    expect(overallLead(counts(420, 554, 15, 11))).toBe("partial");
  });

  it("says nothing about alignment for an empty selection", () => {
    expect(overallLead(counts(0, 0, 0))).toBe("empty");
  });
});

describe("docPairStats", () => {
  it("files each comparison under its two documents in document order", () => {
    const stats = docPairStats(scopeOf(SOURCE, ["A", "B", "C"]));
    expect(stats.map((s) => [s.a.id, s.b.id, s.counts])).toEqual([
      ["A", "B", { reinforce: 3, partial: 1, apart: 1, none: 1, total: 6 }],
      ["A", "C", { reinforce: 3, partial: 1, apart: 2, none: 0, total: 6 }],
      ["B", "C", { reinforce: 1, partial: 2, apart: 1, none: 0, total: 4 }],
    ]);
  });
});

describe("leadingPair", () => {
  const stats = docPairStats(scopeOf(SOURCE, ["A", "B", "C"]));

  it("names no pair when every pair has fewer than 30 comparisons", () => {
    expect(leadingPair(stats, "apart")).toBeNull();
  });

  it("picks the highest share among pairs with enough comparisons", () => {
    expect(leadingPair(stats, "apart", 5)?.b.id).toBe("C");
    // B~C has the second-highest share but only 4 comparisons.
    expect(leadingPair(stats, "apart", 1)?.a.id).toBe("A");
  });

  it("breaks a tie in share by the larger number of comparisons, then document order", () => {
    const make = (a: string, b: string, apart: number, total: number): DocPairStat => ({
      a: doc(a),
      b: doc(b),
      counts: { reinforce: total - apart, partial: 0, apart, none: 0, total },
    });
    const tied = [make("A", "B", 10, 100), make("A", "C", 20, 200), make("B", "C", 20, 200)];
    const lead = leadingPair(tied, "apart");
    expect([lead?.a.id, lead?.b.id]).toEqual(["A", "C"]);
  });
});

// ─── Task 5: recurring themes ─────────────────────────────────────────


function storyline(
  name: string,
  type: CorpusStoryline["type"],
  pairs: string[],
  confidence: CorpusStoryline["confidence"],
  anchors: string[] = [],
): CorpusStoryline {
  return {
    name,
    type,
    description: `About ${name}`,
    contributing_doc_pairs: pairs,
    confidence,
    pair_count: 999,
    spans_documents: [],
    anchor_target_ids: anchors,
  };
}

const RESTORATION = storyline("Shared land restoration", "reinforcement", ["A<->B", "A<->C"], "high", [
  "A2",
  "C1",
]);
const WATER = storyline("Water allocation pressure", "friction", ["A<->C"], "high", ["A3"]);
const GOALS = storyline("Goal overlap", "friction", ["A<->B"], "medium");
const DELIVERY = storyline("Delivery overlap", "friction", ["B<->C"], "medium");

function withThemes(states?: Record<string, CorpusStoryline[]>): BriefSource {
  const full = {
    storylines: [RESTORATION, WATER, GOALS, DELIVERY],
    summary_paragraph: "",
    doc_pair_count: 3,
    schema_version: 2,
  };
  return {
    ...SOURCE,
    themes: {
      ...full,
      states: {
        "": full,
        ...Object.fromEntries(
          Object.entries(states ?? {}).map(([k, storylines]) => [k, { ...full, storylines }]),
        ),
      },
    },
  };
}

describe("themeRows", () => {
  it("counts each theme's comparisons live and shares them out by document", () => {
    const source = withThemes();
    const { rows, exact } = themeRows(source, scopeOf(source, ["A", "B", "C"]), "reinforcement");
    expect(exact).toBe(true);
    expect(rows.map((r) => [r.storyline.name, r.count, r.docShares])).toEqual([
      ["Shared land restoration", 6, { A: 1, B: 0.5, C: 0.5 }],
    ]);
  });

  it("ranks by confidence, then live count, then name", () => {
    const source = withThemes();
    const { rows } = themeRows(source, scopeOf(source, ["A", "B", "C"]), "friction");
    expect(rows.map((r) => [r.storyline.name, r.count])).toEqual([
      ["Water allocation pressure", 2],
      ["Delivery overlap", 1],
      ["Goal overlap", 1],
    ]);
  });

  it("drops themes with nothing left in the selection and says when names are not exact", () => {
    const source = withThemes();
    const { rows, exact } = themeRows(source, scopeOf(source, ["A", "B"]), "friction");
    expect(rows.map((r) => r.storyline.name)).toEqual(["Goal overlap"]);
    expect(exact).toBe(false);
  });

  it("uses the theme state written for the selection when there is one", () => {
    const renamed = { ...GOALS, name: "Goal overlap between A and B" };
    const source = withThemes({ C: [renamed] });
    const { rows, exact } = themeRows(source, scopeOf(source, ["A", "B"]), "friction");
    expect(exact).toBe(true);
    expect(rows.map((r) => r.storyline.name)).toEqual(["Goal overlap between A and B"]);
  });

  it("returns no rows when the country has no themes", () => {
    expect(themeRows(SOURCE, scopeOf(SOURCE, ["A", "B", "C"]), "friction")).toEqual({
      rows: [],
      exact: true,
    });
  });
});

describe("shareStep", () => {
  it("puts a document's share of a theme into three steps", () => {
    expect([0, 0.1, 0.1001, 0.25, 0.2501, 1].map(shareStep)).toEqual([0, 1, 2, 2, 3, 3]);
  });
});

describe("themeExample", () => {
  const scope = scopeOf(SOURCE, ["A", "B", "C"]);

  it("prefers two anchor commitments over a pair that appears more often", () => {
    const example = themeExample(scope, RESTORATION);
    expect([example?.a.id, example?.b.id, example?.level]).toEqual(["A2", "C1", "medium"]);
  });

  it("breaks remaining ties by the pair key and keeps the mechanism", () => {
    const example = themeExample(scope, WATER);
    expect([example?.a.id, example?.b.id, example?.mechanism]).toEqual([
      "A3",
      "C1",
      "resource_competition",
    ]);
  });

  it("returns null when none of the theme's comparisons are in the selection", () => {
    expect(themeExample(scopeOf(SOURCE, ["A", "B"]), WATER)).toBeNull();
  });
});

// ─── Task 6: commitments and map cells ────────────────────────────────

describe("commitmentsToReview", () => {
  it("ranks commitments by potential misalignments and names their partner documents", () => {
    const rows = commitmentsToReview(scopeOf(SOURCE, ["A", "B", "C"]), 3);
    expect(rows.map((r) => [r.commitment.id, r.apart, r.partnerDocs])).toEqual([
      ["A3", 2, [{ doc: "C", count: 2 }]],
      ["B2", 2, [{ doc: "A", count: 1 }, { doc: "C", count: 1 }]],
      ["C2", 2, [{ doc: "A", count: 1 }, { doc: "B", count: 1 }]],
    ]);
  });
});

describe("concentrationOf", () => {
  it("finds the fewest commitments covering half of the potential misalignments", () => {
    expect(concentrationOf(scopeOf(SOURCE, ["A", "B", "C"]))).toEqual({
      total: 4,
      contested: 5,
      top: ["A3"],
      share: 0.5,
      concentrated: true,
    });
  });

  it("reports nothing to concentrate when there is no potential misalignment", () => {
    const scope = scopeOf(SOURCE, ["A", "B", "C"]);
    const calm = { ...scope, alignment: scope.alignment.filter((r) => r.alignment !== "flagged") };
    expect(concentrationOf(calm)).toEqual({
      total: 0,
      contested: 0,
      top: [],
      share: 0,
      concentrated: false,
    });
  });
});

describe("partnersOf", () => {
  it("lists a commitment's partners by tone, in document order", () => {
    const partners = partnersOf(scopeOf(SOURCE, ["A", "B", "C"]), "B2");
    expect(partners.apart.map((c) => c.id)).toEqual(["A2", "C2"]);
    expect(partners.reinforce.map((c) => c.id)).toEqual(["A1", "A3", "C1"]);
  });
});

// ─── Task 7: policy areas ─────────────────────────────────────────────

describe("areaRows", () => {
  const source: BriefSource = {
    ...SOURCE,
    lenses: [
      {
        id: "globe",
        taxonomyType: "globe",
        categories: [
          { id: "g1", name: "Protected areas" },
          { id: "g2", name: "Agriculture" },
          { id: "g3", name: "Water" },
        ],
        primary: { A1: "g1", B1: "g1", C2: "g1", A2: "g2", A3: "g2", C1: "g2" },
      },
    ],
  };

  it("rates each area by its share of all its comparisons, highest first", () => {
    const { rows, average, max } = areaRows(source, scopeOf(source, ["A", "B", "C"]), "globe", 5);
    // Every comparison touching an area's commitments counts, whatever its reading.
    expect(rows.map((r) => [r.id, r.name, r.commitments, r.comparisons, r.apart])).toEqual([
      ["g2", "Agriculture", 3, 11, 3],
      ["g1", "Protected areas", 3, 11, 2],
    ]);
    expect(rows[0].share).toBeCloseTo(3 / 11);
    expect(rows[1].share).toBeCloseTo(2 / 11);
    // All 16 comparisons touch the lens; 4 show potential misalignment.
    expect(average).toBeCloseTo(4 / 16);
    expect(max).toBeCloseTo(3 / 11);
  });

  it("leaves the share empty below the minimum number of comparisons", () => {
    const { rows } = areaRows(source, scopeOf(source, ["A", "B", "C"]), "globe");
    expect(rows.map((r) => r.share)).toEqual([null, null]);
    const thin = areaRows(source, scopeOf(source, ["A", "B"]), "globe", 5);
    expect(thin.rows.map((r) => [r.name, r.share])).toEqual([
      ["Agriculture", null],
      ["Protected areas", null],
    ]);
  });

  it("returns nothing for a lens the country does not have", () => {
    expect(areaRows(source, scopeOf(source, ["A", "B", "C"]), "hr")).toEqual({
      rows: [],
      average: 0,
      max: 0,
    });
  });
});

// ─── Task 12: document shares for the map headline ────────────────────


describe("docToneShares", () => {
  it("counts each document's comparisons by tone, a comparison counting for both documents", () => {
    const source = briefFixture();
    const shares = docToneShares(scopeOf(source, ["A", "B", "C"]));
    expect(shares.map((s) => [s.doc.id, s.commitments, s.total, s.reinforce, s.apart])).toEqual([
      ["A", 6, 72, 54, 6],
      ["B", 6, 72, 42, 15],
      ["C", 6, 72, 48, 9],
    ]);
  });
});

// ─── Round 6: aligned targets, documents, exclusive themes ───────────

describe("alignedTargets", () => {
  const fixture = briefFixture();
  const scope = scopeOf(fixture, ["A", "B", "C"]);

  it("ranks targets by the share of the targets they were compared with that they align with", () => {
    expect(alignedTargets(scope, 5).map((r) => [r.commitment.id, r.aligned, r.compared])).toEqual([
      ["A1", 12, 12],
      ["A2", 12, 12],
      ["A3", 12, 12],
      ["A4", 12, 12],
      ["B1", 10, 12],
    ]);
  });

  it("names the documents a target is aligned with, most first", () => {
    const [top] = alignedTargets(scope, 1);
    expect(top.partnerDocs).toEqual([
      { doc: "B", count: 6 },
      { doc: "C", count: 6 },
    ]);
  });
});

describe("docStats", () => {
  it("counts every target pair a document takes part in, most aligned first", () => {
    const fixture = briefFixture();
    const stats = docStats(scopeOf(fixture, ["A", "B", "C"]));
    expect(stats.map((d) => [d.doc.id, d.counts.reinforce, d.counts.apart, d.counts.total])).toEqual([
      ["A", 54, 6, 72],
      ["C", 48, 9, 72],
      ["B", 42, 15, 72],
    ]);
  });
});

describe("themeRows counts coverage, as the pipeline and the dashboard do", () => {
  it("counts a pair of documents cited by two themes for both", () => {
    const WATER_PLANNING = storyline("Shared water planning", "reinforcement", ["A<->B"], "medium");
    const source = withThemes();
    const both = {
      ...source,
      themes: {
        ...source.themes!,
        storylines: [RESTORATION, WATER_PLANNING, WATER, GOALS, DELIVERY],
        states: {
          "": { ...source.themes!, storylines: [RESTORATION, WATER_PLANNING, WATER, GOALS, DELIVERY] },
        },
      },
    };
    const { rows } = themeRows(both, scopeOf(both, ["A", "B", "C"]), "reinforcement");
    // A<->B holds 3 aligned pairs, A<->C 3: restoration covers both, water planning A<->B.
    expect(rows.map((r) => [r.storyline.name, r.count])).toEqual([
      ["Shared land restoration", 6],
      ["Shared water planning", 3],
    ]);
  });
});

describe("partner documents are listed by their counts", () => {
  // X1 is linked with 2 of Y's 4 targets and with Z's only target: the row
  // states both counts, largest first, and names no winner.
  const ids = ["X1", "Y1", "Y2", "Y3", "Y4", "Z1"];
  const at = Object.fromEntries(ids.map((id, i) => [id, i]));
  const sized = (level: number): BriefSource => ({
    countryId: "t",
    countryName: "T",
    commitments: ids.map((id) => ({ id, doc: id[0], label: id, text: id })),
    documents: ["X", "Y", "Z"].map((id) => ({
      id,
      code: id,
      name: id,
      full: id,
      color: "#000",
      count: ids.filter((c) => c[0] === id).length,
      defaultOn: true,
    })),
    comparisons: [
      [at.X1, at.Y1, level, 0],
      [at.X1, at.Y2, level, 0],
      [at.X1, at.Z1, level, 0],
    ].flat(),
    lenses: [],
    themes: null,
    model: null,
  });

  it("orders aligned partner documents by count", () => {
    const source = sized(0);
    const [x1] = alignedTargets(scopeOf(source, ["X", "Y", "Z"]), 8).filter((r) => r.commitment.id === "X1");
    expect(x1.partnerDocs).toEqual([
      { doc: "Y", count: 2 },
      { doc: "Z", count: 1 },
    ]);
  });

  it("orders potential-misalignment partner documents by count", () => {
    const source = sized(4);
    const x1 = commitmentsToReview(scopeOf(source, ["X", "Y", "Z"]), 8).find((r) => r.commitment.id === "X1");
    expect(x1?.partnerDocs).toEqual([
      { doc: "Y", count: 2 },
      { doc: "Z", count: 1 },
    ]);
  });
});

// ─── Round 7: strongest alignments and the kinds of misalignment ─────

describe("strongestAlignments", () => {
  it("ranks targets by their strong links, as the explorer does", () => {
    const fixture = briefFixture();
    const rows = strongestAlignments(scopeOf(fixture, ["A", "B", "C"]), 6);
    expect(rows.map((r) => [r.commitment.id, r.strong])).toEqual([
      ["C1", 8],
      ["C3", 8],
      ["C5", 8],
      ["B1", 7],
      ["B3", 7],
      ["A1", 6],
    ]);
  });

  it("lists the documents of the strong links by count", () => {
    const fixture = briefFixture();
    const [c1] = strongestAlignments(scopeOf(fixture, ["A", "B", "C"]), 1);
    expect(c1.partnerDocs).toEqual([
      { doc: "A", count: 5 },
      { doc: "B", count: 3 },
    ]);
  });
});

describe("mechanismMix", () => {
  it("counts potential misalignments by what kind they are", () => {
    const fixture = briefFixture();
    expect(mechanismMix(scopeOf(fixture, ["A", "B", "C"]))).toEqual([
      { mechanism: "resource_competition", count: 15 },
    ]);
  });
});

describe("strongConcentration", () => {
  it("finds the fewest targets covering at least half of the strong alignments", () => {
    const fixture = briefFixture();
    expect(strongConcentration(scopeOf(fixture, ["A", "B", "C"]))).toEqual({
      total: 36,
      contested: 12,
      top: ["C1", "C3", "C5"],
      share: 24 / 36,
      concentrated: false,
    });
  });
});

