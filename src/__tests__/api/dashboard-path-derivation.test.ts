import { describe, it, expect } from "vitest";
import { join } from "path";
import { derivePaths } from "@/app/api/dashboard/route";
import { listAvailableModels } from "@/lib/dashboard-data";

const PROJECT_ROOT = process.cwd();
const PYTHON_OUTPUT = join(PROJECT_ROOT, "python", "output");
const PYTHON_DATA = join(PROJECT_ROOT, "python", "data");

/** Countries with per-model subdirs on disk resolve to {country}/{model};
 *  flat-layout countries resolve to the country dir itself. */
function expectedOutputDir(country: string): string {
  const models = listAvailableModels(country);
  return models.length > 0
    ? join(PYTHON_OUTPUT, country, models[0])
    : join(PYTHON_OUTPUT, country);
}

describe("derivePaths — country path", () => {
  it("resolves Mongolia to its output dir and mongolia-targets.json", () => {
    const result = derivePaths(null, "mongolia");
    expect(result.kind).toBe("country");
    if (result.kind !== "country") return;
    expect(result.paths.outputDir).toBe(expectedOutputDir("mongolia"));
    expect(result.paths.dataDir).toBe(PYTHON_DATA);
    expect(result.paths.targetsFile).toBe("mongolia-targets.json");
    expect(result.paths.iso3).toBe("mng");
  });

  it("resolves Panama to python/output/panama/ even though visible: false", () => {
    // Visibility is enforced at the page handler, not the API. The API is
    // file-presence-gated: if the files aren't there, the 404 branch fires.
    const result = derivePaths(null, "panama");
    expect(result.kind).toBe("country");
    if (result.kind !== "country") return;
    expect(result.paths.outputDir).toBe(join(PYTHON_OUTPUT, "panama"));
    expect(result.paths.targetsFile).toBe("panama-targets.json");
    expect(result.paths.iso3).toBe("pan");
  });

  it("lowercases the country param before regex + registry lookup", () => {
    const result = derivePaths(null, "MONGOLIA");
    expect(result.kind).toBe("country");
    if (result.kind !== "country") return;
    expect(result.paths.outputDir).toBe(expectedOutputDir("mongolia"));
  });

  it("rejects path-traversal attempts at the validation step", () => {
    const result = derivePaths(null, "../../etc");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
    expect(result.error).toBe("Invalid country format");
  });

  it("rejects command-injection attempts at the validation step", () => {
    const result = derivePaths(null, "mongolia; rm -rf /");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
    expect(result.error).toBe("Invalid country format");
  });

  it("rejects format-valid but unregistered countries", () => {
    const result = derivePaths(null, "marsland");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
    expect(result.error).toBe("Country not in registry");
  });

  it("treats empty string as missing", () => {
    const result = derivePaths(null, "");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
    expect(result.error).toBe("Missing country param");
  });

  it("treats null country (no param) as missing", () => {
    const result = derivePaths(null, null);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
    expect(result.error).toBe("Missing country param");
  });
});

describe("derivePaths — analysisId precedence", () => {
  it("rejects malformed analysisId", () => {
    const result = derivePaths("not-a-valid-id!!!", null);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(400);
    expect(result.error).toBe("Invalid analysis ID");
  });

  it("returns 404 for well-formed but missing analysisId", () => {
    const result = derivePaths("abcd1234-ffff-aaaa-bbbb-cccccccccccc", null);
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.status).toBe(404);
    expect(result.error).toBe("Analysis not found");
  });

  it("prefers analysisId over country (analysisId wins)", () => {
    // If both params are present, the analysisId branch runs — even if the
    // country is valid. An invalid analysisId should fail validation rather
    // than silently falling through to the country branch.
    const result = derivePaths("not-hex-format!", "mongolia");
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.error).toBe("Invalid analysis ID");
  });
});
