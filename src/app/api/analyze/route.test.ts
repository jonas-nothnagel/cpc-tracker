import { EventEmitter } from "events";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// Only the Python run is faked: the route's checks and file writes stay real.
const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, default: { ...actual, spawn: spawnMock }, spawn: spawnMock };
});

const REPO = process.cwd();

/** The route under a scratch project root, so its analysis folders land there. */
async function routeInScratchRoot() {
  vi.resetModules();
  const root = mkdtempSync(join(tmpdir(), "cpc-root-"));
  mkdirSync(join(root, "python", "data"), { recursive: true });
  copyFileSync(join(REPO, "python", "data", "categories.json"), join(root, "python", "data", "categories.json"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  spawnMock.mockImplementation(() => Object.assign(new EventEmitter(), { unref: () => undefined }));
  const route = await import("./route");
  return { root, POST: route.POST };
}

const post = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest;
const target = (doc: string) => ({ text: `A target of ${doc}`, sourceDocument: doc, sourceLabel: "" });

afterEach(() => {
  vi.restoreAllMocks();
  spawnMock.mockReset();
});

describe("POST /api/analyze", () => {
  it("refuses a one-document upload before anything starts", async () => {
    const { root, POST } = await routeInScratchRoot();
    const res = await POST(post({ country: "Tonga", targets: [target("NDC"), target("NDC")] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "oneDocument" });
    expect(spawnMock).not.toHaveBeenCalled();
    expect(existsSync(join(root, "python", "analyses"))).toBe(false);
  });

  it("refuses an upload without a country name", async () => {
    const { POST } = await routeInScratchRoot();
    const res = await POST(post({ country: "", targets: [target("NDC"), target("NAP")] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "noCountry" });
  });

  it("writes the analysis's inputs and starts the pipeline on them", async () => {
    const { root, POST } = await routeInScratchRoot();
    const res = await POST(
      post({
        country: "Tonga",
        locale: "es",
        targets: [target("NDC"), target("NAP")],
        ownLens: { name: "National priorities", areas: [{ name: "Water", description: "Water policy." }] },
      }),
    );
    expect(res.status).toBe(200);
    const { analysisId } = await res.json();
    const input = join(root, "python", "analyses", analysisId, "input");
    const read = (name: string) => JSON.parse(readFileSync(join(input, name), "utf8"));

    expect(read("categories.json").gga_categories).toHaveLength(7);
    expect(read("country-config.json")).toMatchObject({ name: "Tonga", languages: ["es"] });
    expect(read("taxonomies.json").taxonomies[0]).toMatchObject({ taxonomyType: "policy_area", name: "National priorities" });
    expect(read("targets.json").map((t: { id: string }) => t.id)).toEqual(["NDC_1", "NAP_1"]);
    expect(readdirSync(join(root, "python", "analyses", analysisId, "output"))).toContain("status.json");

    const [command, args, options] = spawnMock.mock.calls[0];
    expect([command, ...args]).toEqual(["uv", "run", "python", "-m", "src.run_analysis", "--targets-file", "targets.json"]);
    expect(options.env).toMatchObject({ CPC_DATA_DIR: input, CPC_RUN_SOURCE: "user_pipeline", CPC_RUN_ID: analysisId });
  });
});
