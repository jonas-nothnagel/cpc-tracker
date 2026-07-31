import { describe, expect, it } from "vitest";
import {
  backLabelKey,
  openPanel,
  panelAnalyticsKind,
  panelKey,
  panelsEqual,
  popPanel,
  pushPanel,
  type BriefingPanel,
} from "./panel-stack";

const ALL_KINDS: BriefingPanel[] = [
  { kind: "target-pair", aId: "NDC_1", bId: "NBSAP_2" },
  { kind: "doc-pair", docA: "NDC", docB: "NBSAP" },
  { kind: "theme", name: "Land use at the agriculture boundary" },
  { kind: "all-storylines" },
  {
    kind: "sector",
    categoryId: "sector_agriculture",
    categoryName: "Agriculture",
    taxonomyType: "sector",
  },
  { kind: "friction-type", mechanism: "goal_conflict" },
  { kind: "target-profile", targetId: "NAP_3" },
  { kind: "doc-targets", doc: "NAP" },
];

describe("panelKey", () => {
  it("gives every kind a distinct key", () => {
    const keys = ALL_KINDS.map(panelKey);
    expect(new Set(keys).size).toBe(ALL_KINDS.length);
  });

  it("treats document pairs as unordered", () => {
    expect(panelKey({ kind: "doc-pair", docA: "NDC", docB: "NBSAP" })).toBe(
      panelKey({ kind: "doc-pair", docA: "NBSAP", docB: "NDC" }),
    );
  });

  it("treats target pairs as ordered, because reading order is chosen", () => {
    expect(
      panelKey({ kind: "target-pair", aId: "BTR_1", bId: "NDC_2" }),
    ).not.toBe(panelKey({ kind: "target-pair", aId: "NDC_2", bId: "BTR_1" }));
  });

  it("ignores the sector display name, which is only a label for the id", () => {
    expect(
      panelKey({
        kind: "sector",
        categoryId: "sector_agriculture",
        categoryName: "Agriculture",
        taxonomyType: "sector",
      }),
    ).toBe(
      panelKey({
        kind: "sector",
        categoryId: "sector_agriculture",
        categoryName: "Agricultura",
        taxonomyType: "sector",
      }),
    );
  });

  it("separates the same category id under different taxonomies", () => {
    expect(
      panelKey({
        kind: "sector",
        categoryId: "6",
        categoryName: "Six",
        taxonomyType: "sector",
      }),
    ).not.toBe(
      panelKey({
        kind: "sector",
        categoryId: "6",
        categoryName: "Six",
        taxonomyType: "globe",
      }),
    );
  });

  it("separates a document-scoped friction type from the corpus-wide one", () => {
    expect(
      panelKey({ kind: "friction-type", mechanism: "goal_conflict" }),
    ).not.toBe(
      panelKey({
        kind: "friction-type",
        mechanism: "goal_conflict",
        doc: "NDC",
      }),
    );
  });
});

describe("panelsEqual", () => {
  it("is true for the same subject and false across subjects", () => {
    expect(
      panelsEqual(
        { kind: "target-profile", targetId: "NAP_3" },
        { kind: "target-profile", targetId: "NAP_3" },
      ),
    ).toBe(true);
    expect(
      panelsEqual(
        { kind: "target-profile", targetId: "NAP_3" },
        { kind: "target-profile", targetId: "NAP_4" },
      ),
    ).toBe(false);
    expect(
      panelsEqual(
        { kind: "doc-targets", doc: "NAP" },
        { kind: "theme", name: "NAP" },
      ),
    ).toBe(false);
  });
});

describe("stack reducers", () => {
  const root: BriefingPanel = { kind: "doc-targets", doc: "NAP" };
  const child: BriefingPanel = { kind: "target-profile", targetId: "NAP_3" };

  it("opens a fresh single-entry trail", () => {
    expect(openPanel(root)).toEqual([root]);
    // A page-level click resets rather than deepening an existing trail.
    expect(openPanel(child)).toEqual([child]);
  });

  it("appends on push", () => {
    expect(pushPanel([root], child)).toEqual([root, child]);
  });

  it("ignores a push of whatever is already on top", () => {
    const stack = [root, child];
    expect(pushPanel(stack, { kind: "target-profile", targetId: "NAP_3" })).toBe(
      stack,
    );
  });

  it("still pushes a repeat that is not on top", () => {
    expect(pushPanel([root, child], root)).toEqual([root, child, root]);
  });

  it("drops the last entry on pop", () => {
    expect(popPanel([root, child])).toEqual([root]);
  });

  it("returns the same array when popping at the root, so React can skip", () => {
    const stack = [root];
    expect(popPanel(stack)).toBe(stack);
    const empty: BriefingPanel[] = [];
    expect(popPanel(empty)).toBe(empty);
  });

  it("survives a push/pop round trip", () => {
    const stack = pushPanel(openPanel(root), child);
    expect(popPanel(stack)).toEqual([root]);
  });
});

describe("backLabelKey", () => {
  it("maps every kind to a message key", () => {
    for (const panel of ALL_KINDS) {
      expect(backLabelKey(panel), `missing key for ${panel.kind}`).toBeTruthy();
    }
  });

  it("keeps the four Back-to-a-name kinds on separate keys", () => {
    // English collapses these; Mongolian case particles do not. See the note on
    // backLabelKey before merging them.
    const keys = [
      backLabelKey({ kind: "theme", name: "x" }),
      backLabelKey({
        kind: "sector",
        categoryId: "x",
        categoryName: "x",
        taxonomyType: "sector",
      }),
      backLabelKey({ kind: "friction-type", mechanism: "goal_conflict" }),
      backLabelKey({ kind: "target-profile", targetId: "x" }),
    ];
    expect(new Set(keys).size).toBe(4);
  });
});

describe("panelAnalyticsKind", () => {
  it("keeps the kinds emitted before the stack existed byte-for-byte", () => {
    expect(
      panelAnalyticsKind({ kind: "target-pair", aId: "a", bId: "b" }),
    ).toBe("target-pair");
    expect(
      panelAnalyticsKind({ kind: "doc-pair", docA: "a", docB: "b" }),
    ).toBe("doc-pair");
    expect(panelAnalyticsKind({ kind: "theme", name: "x" })).toBe("theme");
    expect(panelAnalyticsKind({ kind: "all-storylines" })).toBe("storylines");
    expect(
      panelAnalyticsKind({
        kind: "sector",
        categoryId: "x",
        categoryName: "x",
        taxonomyType: "sector",
      }),
    ).toBe("sector");
  });
});
