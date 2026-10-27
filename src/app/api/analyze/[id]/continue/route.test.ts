import { EventEmitter } from "events";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, default: { ...actual, spawn: spawnMock }, spawn: spawnMock };
});

const ID = "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13";

async function continueWith(status: Record<string, unknown>) {
  vi.resetModules();
  const root = mkdtempSync(join(tmpdir(), "cpc-continue-"));
  const out = join(root, "python", "analyses", ID, "output");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "status.json"), JSON.stringify(status));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  spawnMock.mockImplementation(() => Object.assign(new EventEmitter(), { unref: () => undefined, pid: 4321 }));
  const { POST } = await import("./route");
  return POST(new NextRequest(`http://localhost/api/analyze/${ID}/continue`, { method: "POST" }), {
    params: Promise.resolve({ id: ID }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  spawnMock.mockReset();
});

describe("POST /api/analyze/[id]/continue", () => {
  it("puts an interrupted analysis back in line, to resume from its cache", async () => {
    const res = await continueWith({ status: "interrupted" });
    expect(res.status).toBe(202);
    expect(spawnMock.mock.calls[0][1]).toContain("--resume");
  });

  it("leaves a running analysis alone", async () => {
    const res = await continueWith({ status: "running" });
    expect(res.status).toBe(409);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
