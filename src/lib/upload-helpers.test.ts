import { describe, expect, it } from "vitest";
import {
  extractedItemToTargetRow,
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

describe("extractedItemToTargetRow", () => {
  const base: ExtractedItem = {
    text: "Increase forest area to 9% by 2030",
    label: "Objetivo 3.2",
    sourceDocument: "SECTORAL",
    accepted: true,
  };

  it("preserves document-provided labels over the fallback", () => {
    const row = extractedItemToTargetRow(base, "Water Plan 1");
    expect(row.sourceLabel).toBe("Objetivo 3.2");
    expect(row.source).toBe("extraction");
  });

  it("uses the fallback for generic placeholder labels", () => {
    const row = extractedItemToTargetRow(
      { ...base, label: "Target 4" },
      "Water Plan 4"
    );
    expect(row.sourceLabel).toBe("Water Plan 4");
  });

  it("carries the full provenance contract through", () => {
    const item: ExtractedItem = {
      ...base,
      language: "es",
      textOriginal: "Aumentar la superficie forestal al 9% para 2030",
      labelOriginal: "Objetivo 3.2 (es)",
      textOriginalSource: "source",
      sources: [
        { sourceText: "Aumentar la superficie forestal…", section: "3.2", _quoteMatch: "exact" },
      ],
      textCleanup: "verbatim",
      pageNumbers: [14, 15],
      activities: "Reforestar cuencas prioritarias",
      _provenanceFlag: "QUOTE NOT FOUND — sources[0]…",
    };
    const row = extractedItemToTargetRow(item, "fallback");
    expect(row).toMatchObject({
      text: base.text,
      sourceDocument: "SECTORAL",
      sourceLabel: "Objetivo 3.2",
      textOriginal: item.textOriginal,
      sourceLabelOriginal: item.labelOriginal,
      language: "es",
      textOriginalSource: "source",
      textCleanup: "verbatim",
      pageNumbers: [14, 15],
      activities: item.activities,
      _provenanceFlag: item._provenanceFlag,
    });
    expect(row.sources).toHaveLength(1);
    expect(row.sources?.[0]._quoteMatch).toBe("exact");
  });

  it("omits absent optional fields entirely", () => {
    const row = extractedItemToTargetRow(base, "fallback");
    expect(Object.keys(row).sort()).toEqual(
      ["source", "sourceDocument", "sourceLabel", "text"].sort()
    );
  });
});
