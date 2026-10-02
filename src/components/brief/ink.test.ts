import { describe, expect, it } from "vitest";
import { clip, commitmentLine } from "./ink";

describe("clip", () => {
  it("keeps short text whole and cuts long text at a word boundary", () => {
    expect(clip("Protect wetlands.", 40)).toBe("Protect wetlands.");
    expect(clip("Identify and reserve land with high mineral potential for future use", 40)).toBe(
      "Identify and reserve land with high…",
    );
  });
});

describe("commitmentLine", () => {
  it("uses a descriptive label as it is", () => {
    expect(commitmentLine({ label: "Irrigated agriculture expansion", text: "Expand irrigation." })).toBe(
      "Irrigated agriculture expansion",
    );
  });

  it("follows a clause number with the start of the verbatim text", () => {
    expect(
      commitmentLine(
        { label: "7 b)", text: "Identify and reserve land with high mineral potential for future development" },
        40,
      ),
    ).toBe("7 b) Identify and reserve land with high…");
  });

  it("does not repeat a label the text already starts with", () => {
    expect(commitmentLine({ label: "NBT 3", text: "NBT 3 Restore degraded land" })).toBe(
      "NBT 3 Restore degraded land",
    );
  });

  it("keeps the label when there is no text", () => {
    expect(commitmentLine({ label: "NBT 3", text: "  " })).toBe("NBT 3");
  });

  it("follows a long label that ends in a clause number with the start of the text, within the length", () => {
    expect(
      commitmentLine({
        label: "Agriculture and food security 30",
        text: "Promote climate-resilient crop varieties and diversified farming systems across all agro-ecological zones.",
      }),
    ).toBe("Agriculture and food security 30 Promote climate-resilient crop varieties and…");
  });

  it("finds the clause number before a closing parenthetical, and a dotted one", () => {
    expect(commitmentLine({ label: "Objective 7 (Adaptation)", text: "Reduce flood losses." })).toBe(
      "Objective 7 (Adaptation) Reduce flood losses.",
    );
    expect(commitmentLine({ label: "Action line 3.3.4.1.1.a.1", text: "Map degraded forest." })).toBe(
      "Action line 3.3.4.1.1.a.1 Map degraded forest.",
    );
  });

  it("keeps a long title alone, also one that ends in a year or in a topic in brackets", () => {
    expect(commitmentLine({ label: "Protected areas 30% by 2030", text: "Expand protected areas." })).toBe(
      "Protected areas 30% by 2030",
    );
    expect(
      commitmentLine({ label: "1.1 Actions to Implement (integrate local productive chains)", text: "Build corridors." }),
    ).toBe("1.1 Actions to Implement (integrate local productive chains)");
  });

  it("gives a very long clause label at least 20 characters of the text", () => {
    const label = "Strategic line on integrated territorial management and planning 4";
    expect(commitmentLine({ label, text: "Strengthen land-use planning in every province." }, 64)).toBe(
      `${label} Strengthen land-use…`,
    );
  });
});
