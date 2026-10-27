import { describe, expect, it } from "vitest";
import { analysisPicture, heroLines } from "./picture";
import type { Draft, DraftDocument } from "./types";

function doc(id: string, name: string, kept: number, removed = 0, over: Partial<DraftDocument> = {}): DraftDocument {
  return {
    id,
    source: "read",
    fileName: `${id}.pdf`,
    name,
    code: id.toUpperCase(),
    state: "read",
    targets: [
      ...Array.from({ length: kept }, (_, i) => ({ key: `${id}-${i + 1}`, label: "", text: "t" })),
      ...Array.from({ length: removed }, (_, i) => ({ key: `${id}-r${i + 1}`, label: "", text: "t", removed: true as const })),
    ],
    ...over,
  };
}

function draft(documents: DraftDocument[], actions = 0): Draft {
  return {
    id: "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13",
    createdAt: "",
    updatedAt: "",
    country: "Mongolia",
    locale: "en",
    documents,
    btr: actions > 0 ? { fileNames: ["btr.xlsx"], data: {}, actions } : null,
    ownLens: null,
    footprint: null,
    started: false,
    nextDoc: documents.length + 1,
  };
}

describe("analysisPicture", () => {
  it("is all room before anything is read", () => {
    expect(analysisPicture(null)).toEqual([{ kind: "free", key: "free", count: 150 }]);
  });

  it("gives each read document its kept targets, in the draft's order, then the room left", () => {
    const d = draft([
      doc("d1", "Green development decision", 5, 1),
      doc("d2", "Climate law", 0, 0, { state: "reading" }),
      doc("d3", "National Livestock Programme", 35),
    ]);
    expect(analysisPicture(d)).toEqual([
      { kind: "document", key: "d1", index: 0, name: "Green development decision", count: 5 },
      { kind: "document", key: "d3", index: 2, name: "National Livestock Programme", count: 35 },
      { kind: "free", key: "free", count: 110 },
    ]);
  });

  it("counts reported actions toward the limit", () => {
    const d = draft([doc("d1", "NDC", 20), doc("d2", "NAP", 20)], 27);
    expect(analysisPicture(d).slice(2)).toEqual([
      { kind: "actions", key: "actions", count: 27 },
      { kind: "free", key: "free", count: 83 },
    ]);
  });

  it("leaves no room once the limit is passed", () => {
    const d = draft([doc("d1", "NDC", 100), doc("d2", "NAP", 60)]);
    expect(analysisPicture(d).map((g) => g.kind)).toEqual(["document", "document"]);
  });
});

describe("heroLines", () => {
  const worded = (id: string, texts: string[], over: Partial<DraftDocument> = {}): DraftDocument => ({
    ...doc(id, id, 0),
    targets: texts.map((text, i) => ({ key: `${id}-${i + 1}`, label: "", text })),
    ...over,
  });

  it("deals the kept targets of the read documents in turn, so neighbouring lines come from different documents", () => {
    const water = worded("d1", ["Protect wetlands", "Restore watersheds", "Map aquifers"]);
    const energy = worded("d2", ["Reach 70% renewable electricity"]);
    energy.targets.push({ key: "d2-x", label: "", text: "Phase out coal", removed: true });
    const unread = worded("d3", ["Not read yet"], { state: "reading" });
    expect(heroLines(draft([water, energy, unread]))).toEqual([
      "Protect wetlands",
      "Reach 70% renewable electricity",
      "Restore watersheds",
      "Map aquifers",
    ]);
  });

  it("is empty before anything is read, and clips a long wording on a word", () => {
    expect(heroLines(null)).toEqual([]);
    const long = worded("d1", [`${"word ".repeat(40)}end`]);
    const [line] = heroLines(draft([long]));
    expect(line.length).toBeLessThanOrEqual(151);
    expect(line.endsWith("…")).toBe(true);
  });
});
