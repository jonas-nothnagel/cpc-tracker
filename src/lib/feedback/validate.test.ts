import { describe, expect, it } from "vitest";

import { parseFeedbackBody } from "./validate";

const HASH = "a".repeat(64);
const CLIENT_ID = "123e4567-e89b-42d3-a456-426614174000";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    country: "mongolia",
    surface: "target_pair_rationale",
    anchorIds: ["NDC-T1", "NBSAP-T4"],
    vote: "up",
    clientId: CLIENT_ID,
    locale: "en",
    contentHash: HASH,
    contentSnapshot: "The two targets reinforce each other.",
    ...overrides,
  };
}

describe("parseFeedbackBody", () => {
  it("accepts a well-formed body and derives canonical fields", () => {
    const res = parseFeedbackBody(validBody({ comment: " a note " }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.event.country).toBe("mongolia");
    expect(res.event.anchorKey).toBe("NBSAP-T4__NDC-T1");
    expect(res.event.anchorIds).toEqual(["NDC-T1", "NBSAP-T4"]);
    expect(res.event.vote).toBe("up");
    expect(res.event.comment).toBe("a note");
    expect(res.event.context).toEqual({});
  });

  it("derives the same anchorKey regardless of anchor order", () => {
    const a = parseFeedbackBody(validBody({ anchorIds: ["x1", "y2"] }));
    const b = parseFeedbackBody(validBody({ anchorIds: ["y2", "x1"] }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.event.anchorKey).toBe(b.event.anchorKey);
  });

  it("canonicalizes country casing", () => {
    const res = parseFeedbackBody(validBody({ country: "Mongolia" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.event.country).toBe("mongolia");
  });

  it("normalizes an absent or empty comment to null", () => {
    for (const comment of [undefined, "", "   "]) {
      const res = parseFeedbackBody(validBody({ comment }));
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.event.comment).toBeNull();
    }
  });

  it("truncates oversized snapshots instead of rejecting", () => {
    const res = parseFeedbackBody(
      validBody({ contentSnapshot: "s".repeat(5000) }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.event.contentSnapshot).toHaveLength(2000);
  });

  it("keeps only known context keys with plausible values", () => {
    const res = parseFeedbackBody(
      validBody({
        context: {
          alignment: "flagged",
          mechanism: "goal_conflict",
          surprise: "dropped",
          confidence: "x".repeat(65),
        },
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.event.context).toEqual({
      alignment: "flagged",
      mechanism: "goal_conflict",
    });
  });

  it("falls back to en for unknown locales", () => {
    const res = parseFeedbackBody(validBody({ locale: "de" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.event.locale).toBe("en");
  });

  it("accepts fr (Côte d'Ivoire corpus language)", () => {
    const res = parseFeedbackBody(validBody({ locale: "fr" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.event.locale).toBe("fr");
  });

  it("accepts a single-id storyline anchor", () => {
    const res = parseFeedbackBody(
      validBody({
        surface: "corpus_storyline",
        anchorIds: ["link-restoration-systems-across-land-agendas"],
        context: { storylineType: "reinforcement", confidence: "high" },
      }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.event.anchorKey).toBe(
      "link-restoration-systems-across-land-agendas",
    );
    expect(res.event.context).toEqual({
      storylineType: "reinforcement",
      confidence: "high",
    });
  });

  it("accepts non-Latin anchor ids (Mongolian storyline slugs)", () => {
    const res = parseFeedbackBody(
      validBody({
        surface: "corpus_storyline",
        anchorIds: ["нөхөн-сэргээлтийн-тогтолцоо"],
      }),
    );
    expect(res.ok).toBe(true);
  });

  const rejections: Array<[string, Record<string, unknown>]> = [
    ["unknown country", { country: "atlantis" }],
    ["country with path characters", { country: "../mongolia" }],
    ["unknown surface", { surface: "chat_reply" }],
    ["unknown vote", { vote: "maybe" }],
    ["oversized comment", { comment: "c".repeat(2001) }],
    ["non-string comment", { comment: 42 }],
    ["malformed clientId", { clientId: "not-a-uuid" }],
    ["malformed contentHash", { contentHash: "zz" }],
    ["anchor id with slash", { anchorIds: ["a/b", "c"] }],
    ["anchor id with dot-dot path", { anchorIds: ["..", "c"] }],
    ["identical anchor ids", { anchorIds: ["same", "same"] }],
    ["empty anchor list", { anchorIds: [] }],
    ["too many anchor ids", { anchorIds: ["a1", "b2", "c3"] }],
    ["missing snapshot", { contentSnapshot: undefined }],
  ];

  for (const [name, overrides] of rejections) {
    it(`rejects ${name}`, () => {
      const res = parseFeedbackBody(validBody(overrides));
      expect(res.ok).toBe(false);
    });
  }

  it("rejects non-object bodies", () => {
    for (const raw of [null, "x", 7, [1]]) {
      expect(parseFeedbackBody(raw).ok).toBe(false);
    }
  });
});
