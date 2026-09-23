import { describe, expect, it } from "vitest";
import {
  docPairStats,
  leadingPair,
  scopeOf,
  shareStep,
  themeExample,
  themeRows,
  toneCounts,
  toneOf,
  verdictOf,
  type DocPairStat,
} from "./compute";
import type { BriefCommitment, BriefDocument, BriefSource } from "./source";
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

describe("verdictOf", () => {
  const counts = (reinforce: number, apart: number) => ({
    reinforce,
    apart,
    partial: 0,
    none: 0,
    total: reinforce + apart,
  });

  it("uses the dashboard's 15% and 30% thresholds on potential misalignment", () => {
    expect(verdictOf(counts(851, 149))).toBe("mostly_aligned");
    expect(verdictOf(counts(85, 15))).toBe("mixed");
    expect(verdictOf(counts(70, 30))).toBe("lots_of_misalignment");
  });

  it("reads an empty selection as mostly aligned rather than dividing by zero", () => {
    expect(verdictOf(counts(0, 0))).toBe("mostly_aligned");
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
