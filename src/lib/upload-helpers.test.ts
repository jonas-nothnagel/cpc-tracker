import { describe, expect, it } from "vitest";
import {
  buildExtractionReviewEvent,
  isGenericLabel,
  type ExtractedItem,
} from "./upload-helpers";

describe("isGenericLabel", () => {
  it("treats auto-generated placeholders as generic", () => {
    expect(isGenericLabel("Target 3")).toBe(true);
    expect(isGenericLabel("target 12")).toBe(true);
    expect(isGenericLabel("")).toBe(true);
    expect(isGenericLabel(undefined)).toBe(true);
  });

  it("treats document numbering as document-provided", () => {
    expect(isGenericLabel("Objetivo 3.2")).toBe(false);
    expect(isGenericLabel("Goal 2")).toBe(false);
    expect(isGenericLabel("Target 3.1")).toBe(false);
    expect(isGenericLabel("A5.4")).toBe(false);
  });
});

describe("buildExtractionReviewEvent", () => {
  const meta = {
    countryRaw: "Sri Lanka",
    fileName: "policy.pdf",
    docType: "SECTORAL",
    outcome: "accepted" as const,
    clientId: "c-1",
    locale: "en",
  };
  const item = (over: Partial<ExtractedItem>): ExtractedItem => ({
    text: "Original text",
    label: "Goal 1",
    sourceDocument: "SECTORAL",
    accepted: true,
    initialText: "Original text",
    initialLabel: "Goal 1",
    ...over,
  });

  it("classifies kept, edited, removed, and added", () => {
    const event = buildExtractionReviewEvent(
      [
        item({}),
        item({ text: "Reviewer rewrote this" }),
        item({ accepted: false, _provenanceFlag: "QUOTE NOT FOUND" }),
        item({ manuallyAdded: true, initialText: undefined, text: "Hand-typed target" }),
        item({ manuallyAdded: true, accepted: false }), // added then unchecked = noise
      ],
      meta
    );
    expect(event.counts).toEqual({ extracted: 3, kept: 1, edited: 1, removed: 1, added: 1 });
    const byAction = Object.fromEntries(event.items.map((i) => [i.action, i]));
    expect(byAction.kept.textBefore).toBe("Original text");
    expect(byAction.edited.textAfter).toBe("Reviewer rewrote this");
    expect(byAction.edited.textBefore).toBe("Original text");
    expect(byAction.removed.hadProvenanceFlag).toBe(true);
    expect(byAction.added.textAfter).toBe("Hand-typed target");
    expect(event.items).toHaveLength(4);
  });

  it("discarded outcome marks every extracted item removed", () => {
    const event = buildExtractionReviewEvent([item({}), item({})], {
      ...meta,
      outcome: "discarded",
    });
    expect(event.outcome).toBe("discarded");
    expect(event.counts.removed).toBe(2);
    expect(event.counts.kept).toBe(0);
  });
});
