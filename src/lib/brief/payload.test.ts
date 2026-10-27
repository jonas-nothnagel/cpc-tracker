import { writeFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { analysisPayload, briefPayload } from "./payload";
import { writeFixtureAnalysis } from "./test-analysis";

describe("analysisPayload", () => {
  it("waits for a run to complete", () => {
    const paths = writeFixtureAnalysis({ status: JSON.stringify({ status: "running" }) });
    expect(analysisPayload(paths, "en")).toMatchObject({ kind: "error", status: 409 });
  });

  it("treats a status file caught mid-write as not complete", () => {
    const paths = writeFixtureAnalysis({ status: '{"status":"comp' });
    expect(analysisPayload(paths, "en")).toMatchObject({ kind: "error", status: 409 });
  });

  it("serves a completed run's payload with its config, and no country", () => {
    const p = analysisPayload(writeFixtureAnalysis(), "en");
    expect(p.kind).toBe("ok");
    if (p.kind !== "ok") return;
    expect((p.data.countryConfig as { name: string }).name).toBe("Tonga");
    expect(p.countryId).toBeNull();
  });

  it("reads a re-run's results, not the earlier run's", () => {
    const paths = writeFixtureAnalysis();
    const first = analysisPayload(paths, "en");
    writeFileSync(
      join(paths.outputDir, "alignment.json"),
      JSON.stringify([{ targetAId: "NDC_1", targetBId: "NAP_1", alignment: "low", description: "", confidence: "medium" }]),
    );
    writeFileSync(join(paths.outputDir, "status.json"), JSON.stringify({ status: "completed", completedAt: "2026-10-24T09:00:00+00:00" }));
    const second = analysisPayload(paths, "en");
    expect(first.kind === "ok" && (first.data.alignment as unknown[]).length).toBe(2);
    expect(second.kind === "ok" && (second.data.alignment as unknown[]).length).toBe(1);
  });
});

describe("briefPayload", () => {
  it("rejects an unknown country before any file access", () => {
    expect(briefPayload({ country: "atlantis", analysis: null }, "en")).toMatchObject({ kind: "error", status: 404 });
  });

  it("rejects a malformed analysis id", () => {
    expect(briefPayload({ country: null, analysis: "../../etc" }, "en")).toMatchObject({ kind: "error", status: 400 });
  });

  it("serves a registered country under its slug", () => {
    expect(briefPayload({ country: "countryx", analysis: null }, "en")).toMatchObject({ kind: "ok", countryId: "countryx" });
  });
});
