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
});
