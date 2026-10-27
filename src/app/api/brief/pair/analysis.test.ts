import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ID, writeFixtureAnalysis } from "@/lib/brief/test-analysis";

// The route, the payload loader and the pair lookup run for real, against a
// finished upload written under a scratch project root.
async function routeWithAnalysis(status?: string) {
  vi.resetModules();
  const root = mkdtempSync(join(tmpdir(), "cpc-root-"));
  writeFixtureAnalysis({ dir: join(root, "python", "analyses", FIXTURE_ID), status });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const { GET } = await import("./route");
  return (query: string) => GET(new NextRequest(`http://localhost/api/brief/pair?${query}`));
}

afterEach(() => vi.restoreAllMocks());

describe("GET /api/brief/pair for an uploaded analysis", () => {
  it("serves its comparison, with no contracts", async () => {
    const get = await routeWithAnalysis();
    const res = await get(`analysis=${FIXTURE_ID}&a=NDC_1&b=NAP_1&locale=en`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pair).toMatchObject({ targetAId: "NDC_1", targetBId: "NAP_1", alignment: "flagged" });
    expect(body.both).toBeUndefined();
  });

  it("answers 409 while the run is still going", async () => {
    const get = await routeWithAnalysis(JSON.stringify({ status: "running" }));
    expect((await get(`analysis=${FIXTURE_ID}&a=NDC_1&b=NAP_1`)).status).toBe(409);
  });
});
