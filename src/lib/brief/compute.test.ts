import { describe, expect, it } from "vitest";
import {
  docPairStats,
  leadingPair,
  scopeOf,
  toneCounts,
  toneOf,
  verdictOf,
  type DocPairStat,
} from "./compute";
import type { BriefCommitment, BriefDocument, BriefSource } from "./source";

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
