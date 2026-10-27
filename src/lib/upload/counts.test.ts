import { describe, expect, it } from "vitest";
import { draftCounts } from "./counts";
import type { Draft, DraftDocument } from "./types";

const doc = (id: string, kept: number, removed = 0, state: DraftDocument["state"] = "read"): DraftDocument => ({
  id,
  source: "read",
  fileName: `${id}.pdf`,
  name: id,
  code: id.toUpperCase(),
  state,
  targets: [
    ...Array.from({ length: kept }, (_, i) => ({ key: `${id}-${i}`, label: "", text: "t" })),
    ...Array.from({ length: removed }, (_, i) => ({ key: `${id}-r${i}`, label: "", text: "t", removed: true as const })),
  ],
});

const draft = (documents: DraftDocument[], actions = 0): Draft => ({
  id: "x",
  createdAt: "",
  updatedAt: "",
  country: "",
  locale: "en",
  documents,
  btr: actions ? { fileNames: ["btr.xlsx"], data: {}, actions } : null,
  ownLens: null,
  footprint: null,
  started: false,
  nextDoc: documents.length + 1,
});

describe("draftCounts", () => {
  it("counts the kept targets, the documents with targets and their target pairs", () => {
    expect(draftCounts(draft([doc("a", 56, 4), doc("b", 11), doc("c", 22), doc("d", 0, 0, "noText")]))).toEqual({
      targets: 89,
      actions: 0,
      items: 89,
      pairs: 2090,
      withTargets: 3,
    });
  });

  it("adds reported actions to what counts toward 150, not to the target pairs", () => {
    expect(draftCounts(draft([doc("a", 60), doc("b", 33)], 27))).toMatchObject({ items: 120, pairs: 1980, actions: 27 });
  });

  it("counts nothing without a draft", () => {
    expect(draftCounts(null)).toEqual({ targets: 0, actions: 0, items: 0, pairs: 0, withTargets: 0 });
  });
});
