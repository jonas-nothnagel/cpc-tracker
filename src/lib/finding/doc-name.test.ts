import { describe, expect, it } from "vitest";
import { findingDocName } from "./doc-name";
import type { CountryConfig } from "@/types";

const CONFIG = {
  documentTypes: [
    {
      id: "FSS",
      shortLabel: "FSS",
      mediumLabel: "FSS",
      fullLabel: "Food Supply and Security Measures (Parliament Resolution 36, June 2022)",
    },
    {
      id: "SECTORAL",
      shortLabel: "Vision 2050",
      mediumLabel: "Vision 2050",
      fullLabel: "Vision 2050 (Long-term Development Policy)",
    },
    {
      id: "HR",
      shortLabel: "HR",
      mediumLabel: "HR (Nature Pledge Roadmap)",
      fullLabel: "Hoja de Ruta del Nature Pledge",
    },
  ],
} as unknown as CountryConfig;

describe("findingDocName", () => {
  it("prefers the friendly name when the medium label carries one", () => {
    expect(findingDocName(CONFIG, "HR")).toBe("Nature Pledge Roadmap");
  });

  it("falls back to the full label without its trailing parenthetical", () => {
    expect(findingDocName(CONFIG, "FSS")).toBe(
      "Food Supply and Security Measures",
    );
  });

  it("keeps already-human medium labels as they are", () => {
    expect(findingDocName(CONFIG, "SECTORAL")).toBe("Vision 2050");
  });

  it("returns the raw id for unknown documents", () => {
    expect(findingDocName(CONFIG, "XYZ")).toBe("XYZ");
    expect(findingDocName(null, "NDC")).toBe("NDC");
  });

  it("prefers the native full name when asked (non-English locales)", () => {
    expect(findingDocName(CONFIG, "HR", { preferNative: true })).toBe(
      "Hoja de Ruta del Nature Pledge",
    );
    expect(findingDocName(CONFIG, "FSS", { preferNative: true })).toBe(
      "Food Supply and Security Measures",
    );
  });
});
