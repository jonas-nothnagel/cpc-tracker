import { describe, expect, it } from "vitest";
import {
  apartStep,
  areaRows,
  commitmentsToReview,
  docToneShares,
  concentrationOf,
  docPairStats,
  leadingPair,
  mapCells,
  overallLead,
  partnersOf,
  reinforceStep,
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

describe("mapCells", () => {
  it("counts each commitment's comparisons by tone", () => {
    const cells = mapCells(scopeOf(SOURCE, ["A", "B", "C"]));
    expect(cells.map((c) => [c.commitment.id, c.apart, c.reinforce, c.total])).toEqual([
      ["A1", 0, 4, 4],
      ["A2", 1, 1, 4],
      ["A3", 2, 1, 4],
      ["B1", 0, 1, 5],
      ["B2", 2, 3, 5],
      ["C1", 1, 3, 5],
      ["C2", 2, 1, 5],
    ]);
  });
});

describe("apartStep and reinforceStep", () => {
  it("bins potential misalignments as 0, 1-2, 3-5, 6-10, 11-20, 21+", () => {
    expect([0, 1, 2, 3, 5, 6, 10, 11, 20, 21, 999].map(apartStep)).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
    ]);
  });

  it("bins the reinforcing share in quarters", () => {
    expect([0, 0.2499, 0.25, 0.4999, 0.5, 0.75, 1].map(reinforceStep)).toEqual([
      0, 0, 1, 1, 2, 3, 3,
    ]);
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
