import { describe, expect, it } from "vitest";

import { clickRole, sanitizeLabel } from "./labels";
import { ANALYTICS_LABEL_MAX } from "./types";

describe("sanitizeLabel", () => {
  it("prefers data-track over aria-label over text", () => {
    expect(
      sanitizeLabel({ dataTrack: "run-analysis", ariaLabel: "a", text: "b" }),
    ).toBe("run-analysis");
    expect(sanitizeLabel({ ariaLabel: "Close drawer", text: "×" })).toBe(
      "Close drawer",
    );
    expect(sanitizeLabel({ text: "Upload data" })).toBe("Upload data");
  });

  it("collapses whitespace and truncates to the cap", () => {
    expect(sanitizeLabel({ text: "  Run\n\n  analysis   now " })).toBe(
      "Run analysis now",
    );
    const long = sanitizeLabel({ text: "y".repeat(300) });
    expect(long?.length).toBe(ANALYTICS_LABEL_MAX);
  });

  it("never uses text from elements containing form controls", () => {
    expect(sanitizeLabel({ text: "user@example.com", containsInput: true })).toBe(
      null,
    );
    expect(
      sanitizeLabel({
        ariaLabel: "Search targets",
        text: "secret text",
        containsInput: true,
      }),
    ).toBe("Search targets");
  });

  it("masks long digit runs (ids, phone numbers)", () => {
    expect(sanitizeLabel({ text: "Case 12345678 details" })).toBe(
      "Case # details",
    );
    expect(sanitizeLabel({ text: "Top 100 targets" })).toBe("Top 100 targets");
  });

  it("returns null when nothing usable remains", () => {
    expect(sanitizeLabel({})).toBeNull();
    expect(sanitizeLabel({ text: "   " })).toBeNull();
  });
});

describe("clickRole", () => {
  it("maps tags and ARIA roles to coarse roles", () => {
    expect(clickRole("A", null)).toBe("link");
    expect(clickRole("BUTTON", null)).toBe("button");
    expect(clickRole("DIV", "button")).toBe("button");
    expect(clickRole("DIV", "tab")).toBe("tab");
    expect(clickRole("SPAN", null)).toBe("other");
  });
});
