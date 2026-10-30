import { describe, expect, it } from "vitest";
import { scopeOf } from "./compute";
import { briefFixture } from "./test-fixture";
import { DEFAULT_NR7_SORT, nextNr7Sort, nr7Pairs, nr7Reading, nr7Setup, sortNr7, type Nr7ReadRow, type Nr7Setup } from "./nr7";
import type { SpendingSetup } from "./spending";

const item = (n: number, status: string, nbsap: string | null = null) => ({
  targetId: `NT${String(n).padStart(2, "0")}`,
  targetText: `Target ${n}`,
  progressStatus: status,
  nbsapTargetId: nbsap,
});

const data = {
  nr7Data: {
    source: { publishedOn: "2026-02-28" },
    progressItems: [item(1, "limited", "T1"), item(2, "on_track", "T2"), item(3, "no_progress", null)],
    questionnaire: {
      answers: [
        { targetId: "NT01", indicatorCode: "1.b", questionNumber: "1" },
        { targetId: "NT01", indicatorCode: "1.b", questionNumber: "2" },
        { targetId: "NT02", indicatorCode: "3.b", questionNumber: "1" },
      ],
    },
    indicators: [
      { id: "1.1", targetIds: ["NT01", "NT02"], series: [{ points: [{ year: 2020, value: 1 }] }], comments: null },
      { id: "1.2", targetIds: ["NT01"], series: [], comments: "A note" },
      { id: "1.3", targetIds: ["NT01"], series: [], comments: null },
    ],
  },
  targets: [{ id: "BTR_1", sourceDocument: "BTR" }, { id: "ADP_1", sourceDocument: "BTR_ADP" }],
  alignment: [
    { targetAId: "T1", targetBId: "BTR_1", alignment: "high" },
    { targetAId: "ADP_1", targetBId: "T1", alignment: "high" },
    { targetAId: "T1", targetBId: "ADP_1", alignment: "low" },
    { targetAId: "T1", targetBId: "T2", alignment: "high" },
    { targetAId: "BTR_1", targetBId: "ADP_1", alignment: "high" },
  ],
};

const spending = {
  showMatches: true,
  lines: [
    { id: "BER_a", total: 10, totalUsd: 5, matches: ["T1", "T2"] },
    { id: "BER_b", total: 4, totalUsd: 2, matches: ["T1"] },
  ],
} as unknown as SpendingSetup;

describe("nr7Setup", () => {
  const setup = nr7Setup(data, spending)!;
  const row = (id: string) => setup.rows.find((r) => r.id === id)!;

  it("is null for a country without a report", () => {
    expect(nr7Setup({ nr7Data: null })).toBeNull();
    expect(nr7Setup({ nr7Data: { progressItems: [] } })).toBeNull();
  });

  it("counts every indicator the report gives a target: series, a note, questionnaire indicators", () => {
    expect(row("NT01").indicators).toBe(3); // 1.1, 1.2 and 1.b; 1.3 says nothing
    expect(row("NT02").indicators).toBe(2);
    expect(row("NT03").indicators).toBe(0);
  });

  it("counts a line under every target it matches, without adding across rows", () => {
    expect(row("NT01")).toMatchObject({ lines: 2, spend: 14, spendUsd: 7 });
    expect(row("NT02")).toMatchObject({ lines: 1, spend: 10, spendUsd: 5 });
  });

  it("counts only strong readings between a reported action and a policy target", () => {
    expect(row("NT01").actions).toBe(2);
    expect(row("NT02").actions).toBe(0);
  });

  it("leaves out what the country does not have", () => {
    const bare = nr7Setup({ nr7Data: data.nr7Data })!;
    expect(bare.rows[0]).toMatchObject({ actions: null, lines: null });
  });

  it("carries the number the country gave the target", () => {
    expect(row("NT03").number).toBe("3");
  });
});

describe("nr7Reading", () => {
  const source = briefFixture();
  const [a, b] = source.commitments;
  const setup: Nr7Setup = {
    publishedOn: null,
    rows: [
      { id: "NT01", number: "1", status: "limited", targetId: a.id, reportText: "One", indicators: 0, actions: null, lines: null, spend: 0, spendUsd: null },
      { id: "NT02", number: "2", status: "on_track", targetId: b.id, reportText: "Two", indicators: 0, actions: null, lines: null, spend: 0, spendUsd: null },
      { id: "NT03", number: "3", status: "no_progress", targetId: null, reportText: "Three", indicators: 0, actions: null, lines: null, spend: 0, spendUsd: null },
    ],
  };
  const scope = scopeOf(source, source.documents.map((d) => d.id));
  const reading = nr7Reading(setup, source, scope);

  it("counts behind schedule as limited progress or none", () => {
    expect(reading.behind).toBe(2);
    expect(reading.byStatus).toEqual({ no_progress: 1, limited: 1, unknown: 0, on_track: 1 });
  });

  it("names a row without a corpus target by the report's wording, with nothing to read", () => {
    const row = reading.rows.find((r) => r.id === "NT03")!;
    expect(row).toMatchObject({ label: "Three", text: "Three", aligned: null, apart: null, pairs: 0 });
  });

  it("states the target's number once, by its title where it has one", () => {
    const named = (label: string, text: string, number: string) => {
      const withLabel = { ...source, commitments: [{ ...a, label, text }] };
      const only: Nr7Setup = { publishedOn: null, rows: [{ ...setup.rows[0], number, targetId: a.id }] };
      return nr7Reading(only, withLabel, scope).rows[0];
    };
    expect(named("3 Protected areas", "By 2030, 30% of the area.", "3")).toMatchObject({
      label: "Protected areas",
      text: "By 2030, 30% of the area.",
    });
    expect(named("Target 3", "By 2035, Panama will strengthen SINAP.", "3").label).toBe("By 2035, Panama will strengthen SINAP.");
    expect(named("Meta 3", "Para 2035, Panamá fortalecerá el SINAP.", "3").label).toBe("Para 2035, Panamá fortalecerá el SINAP.");
    expect(named("NBT 3", "Conserve 30% of the island.", "3").label).toBe("Conserve 30% of the island.");
  });
});

describe("nr7Pairs", () => {
  const source = briefFixture();
  const scope = scopeOf(source, source.documents.map((d) => d.id));

  it("names the targets behind a row's potential misalignments, each document in turn", () => {
    expect(nr7Pairs(scope, "A6").apart.map((c) => c.id)).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
    expect(nr7Pairs(scope, "B6").apart.map((c) => c.id)).toEqual(["A6", "C1", "C2", "C3", "C4", "C5", "C6"]);
  });

  it("puts strong alignments first, each document in turn", () => {
    expect(nr7Pairs(scope, "A1").aligned.map((c) => c.id)).toEqual([
      "B1", "C1", "B3", "C3", "B5", "C5",
      "B2", "C2", "B4", "C4", "B6", "C6",
    ]);
  });

  it("counts what the row's shares count", () => {
    const pairs = nr7Pairs(scope, "A1");
    expect(pairs.apart).toHaveLength(0);
    expect(pairs.aligned).toHaveLength(12);
  });
});

describe("sorting", () => {
  const row = (number: string, status: Nr7ReadRow["status"], extra: Partial<Nr7ReadRow> = {}) =>
    ({ id: `NT${number}`, number, status, indicators: 0, aligned: null, apart: null, lines: null, spend: 0, spendUsd: null, actions: null, ...extra }) as Nr7ReadRow;

  it("reads down the report's scale, then the country's own order, an unknown rating last", () => {
    const rows = [row("5", "unknown"), row("1", "no_progress"), row("2", "limited"), row("3", "on_track"), row("4", "limited")];
    expect(sortNr7(rows, DEFAULT_NR7_SORT).map((r) => r.number)).toEqual(["3", "2", "4", "1", "5"]);
    expect(sortNr7(rows, { key: "status", dir: "asc" }).map((r) => r.number)).toEqual(["1", "2", "4", "3", "5"]);
  });

  it("puts a row with nothing to read last whichever the direction", () => {
    const rows = [row("1", "limited"), row("2", "limited", { apart: 0.1 }), row("3", "limited", { apart: 0.3 })];
    expect(sortNr7(rows, { key: "apart", dir: "desc" }).map((r) => r.number)).toEqual(["3", "2", "1"]);
    expect(sortNr7(rows, { key: "apart", dir: "asc" }).map((r) => r.number)).toEqual(["2", "3", "1"]);
  });

  it("ranks amounts as the page shows them", () => {
    const rows = [row("1", "limited", { lines: 1, spend: 10, spendUsd: 1 }), row("2", "limited", { lines: 1, spend: 5, spendUsd: 9 })];
    expect(sortNr7(rows, { key: "spend", dir: "desc" }, (r) => r.spendUsd ?? 0).map((r) => r.number)).toEqual(["2", "1"]);
  });

  it("a first pick shows the most first, the number its own order; a second turns it", () => {
    expect(nextNr7Sort(DEFAULT_NR7_SORT, "apart")).toEqual({ key: "apart", dir: "desc" });
    expect(nextNr7Sort(DEFAULT_NR7_SORT, "number")).toEqual({ key: "number", dir: "asc" });
    expect(nextNr7Sort({ key: "apart", dir: "desc" }, "apart")).toEqual({ key: "apart", dir: "asc" });
    expect(nextNr7Sort({ key: "apart", dir: "desc" }, "status")).toEqual({ key: "status", dir: "desc" });
    expect(nextNr7Sort(DEFAULT_NR7_SORT, "status")).toEqual({ key: "status", dir: "asc" });
  });
});
