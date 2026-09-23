import { describe, expect, it } from "vitest";
import { FLAGGED_COLOR } from "@/lib/utils";
import { ANSWER_COLORS, NR7_COLORS } from "./nr7-colors";

describe("NR7 colours", () => {
  it("keeps every rating colour apart from the alignment red, so a rating dot is never read as a flag", () => {
    for (const [status, colour] of Object.entries(NR7_COLORS)) {
      expect(colour.toLowerCase(), status).not.toBe(FLAGGED_COLOR.toLowerCase());
    }
  });

  it("keeps the questionnaire 'no' apart from the alignment red: the answer bar sits beside the flagged pairs", () => {
    expect(ANSWER_COLORS.no.toLowerCase()).not.toBe(FLAGGED_COLOR.toLowerCase());
  });
});
