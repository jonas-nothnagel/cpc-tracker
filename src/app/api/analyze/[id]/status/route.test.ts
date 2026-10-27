import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const ID = "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13";

/** The route under a scratch project root holding one analysis's status file
 *  (or none). */
async function statusFor(raw: string | null) {
  vi.resetModules();
  const root = mkdtempSync(join(tmpdir(), "cpc-root-"));
  const output = join(root, "python", "analyses", ID, "output");
  mkdirSync(output, { recursive: true });
  if (raw !== null) writeFileSync(join(output, "status.json"), raw);
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://localhost/api/analyze/${ID}/status`), { params: Promise.resolve({ id: ID }) });
}

afterEach(() => vi.restoreAllMocks());

describe("GET /api/analyze/[id]/status", () => {
  it("asks the page to try again when the status file is caught mid-write", async () => {
    const res = await statusFor('{"status":"comp');
    expect(res.status).toBe(503);
  });

  it("serves a readable status", async () => {
    const res = await statusFor(JSON.stringify({ status: "running", step: 5 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "running", step: 5 });
  });

  it("says where an analysis stands in line", async () => {
    const res = await statusFor(JSON.stringify({ status: "completed" }));
    expect(await res.json()).toMatchObject({ status: "completed", state: "completed", ahead: 0 });
  });

  it("answers 404 where there is no analysis", async () => {
    expect((await statusFor(null)).status).toBe(404);
  });
});
