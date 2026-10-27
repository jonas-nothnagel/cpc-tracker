import { rmSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { analysisBrief, analysisBriefFrom, analysisInEnglish } from "./analysis";
import { FIXTURE_ID, writeFixtureAnalysis } from "./test-analysis";

describe("analysisBriefFrom", () => {
  it("is pending while the run is going, after it failed, or while its status is being written", () => {
    for (const status of [JSON.stringify({ status: "running" }), JSON.stringify({ status: "failed" }), '{"status":"comp', null]) {
      expect(analysisBriefFrom(writeFixtureAnalysis({ status }), FIXTURE_ID, "en").kind).toBe("pending");
    }
  });

  it("is ready when complete: an analysis with its names, colours and own lens", () => {
    const brief = analysisBriefFrom(writeFixtureAnalysis({ ownLens: true }), FIXTURE_ID, "en");
    expect(brief.kind).toBe("ready");
    if (brief.kind !== "ready") return;
    expect(brief.source).toMatchObject({ countryId: "", analysisId: FIXTURE_ID, countryName: "Tonga", languages: [] });
    expect(brief.source.documents.map((d) => [d.id, d.name, d.color])).toEqual([
      ["NDC", "Nationally Determined Contribution", "#0468b1"],
      ["NAP", "National Adaptation Plan", "#0e7490"],
    ]);
    expect(brief.source.lenses[0]).toMatchObject({
      id: "own",
      name: "National priorities",
      tooltip: "Tonga Strategic Development Framework",
    });
  });

  it("still opens an analysis made before uploads wrote a country config", () => {
    const brief = analysisBriefFrom(writeFixtureAnalysis({ legacy: true }), FIXTURE_ID, "en");
    expect(brief.kind).toBe("ready");
    if (brief.kind !== "ready") return;
    expect(brief.source.countryName).toBe("Unknown");
    expect(brief.source.documents.map((d) => [d.name, d.color])).toEqual([
      ["NAP", "#94a3b8"],
      ["NDC", "#94a3b8"],
    ]);
    // Those runs ranked no primary area, so the brief offers no lens.
    expect(brief.source.lenses).toEqual([]);
    // Their old verdict words still read as a potential misalignment
    // (comparisons are [a, b, level, mechanism]; level 4 is "flagged").
    const levels = brief.source.comparisons.filter((_, i) => i % 4 === 2);
    expect(levels).toContain(4);
  });

  it("is unreadable when a completed run's results are missing, so nothing waits for it forever", () => {
    const paths = writeFixtureAnalysis();
    rmSync(join(paths.outputDir, "alignment.json"));
    expect(analysisBriefFrom(paths, FIXTURE_ID, "en").kind).toBe("unreadable");
  });
});

describe("analysisBrief", () => {
  it("is missing for an id with no analysis, or a malformed one", () => {
    expect(analysisBrief("00000000-0000-4000-8000-000000000000", "en").kind).toBe("missing");
    expect(analysisBrief("../../python", "en").kind).toBe("missing");
  });
});

describe("analysisInEnglish", () => {
  it("sends a language the upload did not use to English, keeping the reader's choices", () => {
    expect(analysisInEnglish(FIXTURE_ID, ["es"], "mn", { lens: "own", docs: ["NDC", "NAP"] })).toBe(
      `/en/analysis/${FIXTURE_ID}?lens=own&docs=NDC&docs=NAP`,
    );
  });

  it("leaves English and the upload's own language alone", () => {
    expect(analysisInEnglish(FIXTURE_ID, ["es"], "es", {})).toBeNull();
    expect(analysisInEnglish(FIXTURE_ID, [], "en", {})).toBeNull();
  });
});
