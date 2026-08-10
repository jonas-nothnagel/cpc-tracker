import { describe, it, expect } from "vitest";
import { readCoverageGaps } from "./coverage";
import type { CountryConfig } from "@/types";

/** `coverageGaps` is read off a config that does not declare it in the shared
 *  type, so the reader has to be defensive about shape — these are the cases
 *  that would otherwise render a broken or empty gap list. */
describe("readCoverageGaps", () => {
  it("reads declared gaps", () => {
    const cfg = {
      coverageGaps: [
        { id: "fisheries", title: "Fisheries", text: "Not in this corpus.", source: "ARAP" },
      ],
    } as unknown as CountryConfig;
    expect(readCoverageGaps(cfg)).toEqual([
      { id: "fisheries", title: "Fisheries", text: "Not in this corpus.", source: "ARAP" },
    ]);
  });

  it("returns nothing for a country that declares none", () => {
    expect(readCoverageGaps({} as CountryConfig)).toEqual([]);
    expect(readCoverageGaps(null)).toEqual([]);
  });

  it("drops malformed entries rather than rendering a blank row", () => {
    const cfg = {
      coverageGaps: [
        { id: "ok", text: "Real gap." },
        { id: "no-text" },
        { text: "no id" },
        "a string",
        null,
      ],
    } as unknown as CountryConfig;
    expect(readCoverageGaps(cfg).map((g) => g.id)).toEqual(["ok"]);
  });

  it("ignores a coverageGaps that is not a list", () => {
    const cfg = { coverageGaps: { id: "x", text: "y" } } as unknown as CountryConfig;
    expect(readCoverageGaps(cfg)).toEqual([]);
  });
});
