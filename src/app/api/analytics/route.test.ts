import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyticsPath, currentMonth } from "@/lib/analytics/paths";

import { POST } from "./route";

const event = {
  type: "page_view",
  ts: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
  clientId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  locale: "en",
  route: "/dashboard",
  country: "mongolia",
  viewport: "lg",
  ua: "chrome/linux",
  viewId: "abcd1234",
  analysisId: null,
  referrerRoute: null,
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

let dir: string;
const prev = process.env.CPC_LEDGER_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cpc-analytics-route-"));
  process.env.CPC_LEDGER_DIR = dir;
});

afterEach(() => {
  if (prev === undefined) delete process.env.CPC_LEDGER_DIR;
  else process.env.CPC_LEDGER_DIR = prev;
  rmSync(dir, { recursive: true, force: true });
});

describe("POST /api/analytics", () => {
  it("returns 204 and appends the batch to the monthly ledger", async () => {
    const res = await post({ events: [event, { ...event, type: "page_leave", durationMs: 1200 }] });
    expect(res.status).toBe(204);
    const raw = readFileSync(analyticsPath(currentMonth()), "utf-8");
    const lines = raw.trimEnd().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].schema).toBe(1);
    expect(lines[0].route).toBe("/dashboard");
  });

  it("rejects oversized bodies with 413 (declared and actual)", async () => {
    const res = await post({ events: [event] }, { "content-length": "9999999" });
    expect(res.status).toBe(413);
    const big = await post({
      events: [{ ...event, junk: "x".repeat(70_000) }],
    });
    expect(big.status).toBe(413);
  });

  it("rejects malformed JSON and fully invalid batches with 400", async () => {
    expect((await post("not json{")).status).toBe(400);
    expect((await post({ events: [] })).status).toBe(400);
    expect((await post({ events: [{ junk: 1 }] })).status).toBe(400);
  });

  it("still returns 204 when the ledger directory is unwritable", async () => {
    // A file where the base dir should be makes mkdirSync fail (ENOTDIR).
    writeFileSync(join(dir, "blocker"), "");
    process.env.CPC_LEDGER_DIR = join(dir, "blocker", "sub");
    const res = await post({ events: [event] });
    expect(res.status).toBe(204);
  });
});
