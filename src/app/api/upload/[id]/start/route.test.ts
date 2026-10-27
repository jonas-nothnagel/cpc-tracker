import { EventEmitter } from "events";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftDocument } from "@/lib/upload/types";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, default: { ...actual, spawn: spawnMock }, spawn: spawnMock };
});

const REPO = process.cwd();
let root = "";
beforeEach(() => {
  vi.resetModules();
  root = mkdtempSync(join(tmpdir(), "cpc-start-"));
  mkdirSync(join(root, "python", "data"), { recursive: true });
  copyFileSync(join(REPO, "python", "data", "categories.json"), join(root, "python", "data", "categories.json"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  spawnMock.mockImplementation(() => Object.assign(new EventEmitter(), { unref: () => undefined, pid: 777 }));
});
afterEach(() => {
  vi.restoreAllMocks();
  spawnMock.mockReset();
});

const doc = (id: string, code: string, name: string, texts: string[]): DraftDocument => ({
  id,
  source: "read",
  fileName: `${code}.pdf`,
  name,
  code,
  state: "read",
  targets: texts.map((text, i) => ({ key: `${id}-${i + 1}`, label: `${i + 1}`, text, initialText: text, initialLabel: `${i + 1}` })),
});

async function draftWith(documents: DraftDocument[]) {
  const { createDraft, updateDraft } = await import("@/lib/upload/draft");
  const draft = createDraft({ country: "Tonga", locale: "es" });
  updateDraft(draft.id, (d) => {
    d.documents = documents;
    d.nextDoc = documents.length + 1;
  });
  return draft.id;
}

const start = async (id: string) => {
  const { POST } = await import("./route");
  return POST(new NextRequest(`http://localhost/api/upload/${id}/start`, { method: "POST", body: JSON.stringify({ clientId: "client-1" }) }), {
    params: Promise.resolve({ id }),
  });
};

describe("POST /api/upload/{id}/start", () => {
  it("starts one analysis under the draft's id, however often it is pressed", async () => {
    const id = await draftWith([
      doc("d1", "NDC", "Updated NDC 2021", ["Cut emissions by 20%"]),
      doc("d2", "NWRP", "National Water Resource Policy", ["Protect wetlands", "Restore watersheds"]),
    ]);
    const first = await start(id);
    const second = await start(id);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ analysisId: id });
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ analysisId: id });
    expect(spawnMock).toHaveBeenCalledTimes(1);

    const input = join(root, "python", "analyses", id, "input");
    const config = JSON.parse(readFileSync(join(input, "country-config.json"), "utf8"));
    expect(config.documentTypes.map((d: { fullLabel: string }) => d.fullLabel)).toEqual([
      "Updated NDC 2021",
      "National Water Resource Policy",
    ]);
    expect(JSON.parse(readFileSync(join(root, "python", "analyses", id, "output", "status.json"), "utf8"))).toMatchObject({
      status: "queued",
    });
    const { readDraft } = await import("@/lib/upload/draft");
    expect(readDraft(id)!.started).toBe(true);
  });

  it("keeps an analysis that is in line started when the line cannot move this moment", async () => {
    const id = await draftWith([doc("d1", "NDC", "NDC", ["A"]), doc("d2", "NAP", "NAP", ["B"])]);
    spawnMock.mockImplementation(() => {
      throw new Error("spawn EAGAIN");
    });
    const res = await start(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ analysisId: id });
    const { readDraft } = await import("@/lib/upload/draft");
    expect(readDraft(id)!.started).toBe(true);
    // Still in line: the next look (every 30 seconds) starts it.
    const { queueLength } = await import("@/lib/upload/queue");
    expect(queueLength()).toBeGreaterThan(0);
  });

  it("records the reviewer's corrections for each document the AI read", async () => {
    const id = await draftWith([doc("d1", "NDC", "NDC", ["A"]), doc("d2", "NAP", "NAP", ["B"])]);
    await start(id);
    const feedback = join(root, "python", "output", "feedback");
    const rows = readdirSync(feedback).flatMap((f) =>
      readFileSync(join(feedback, f), "utf8").trim().split("\n").map((l) => JSON.parse(l)),
    );
    expect(rows.map((r) => [r.docType, r.outcome, r.clientId, r.counts.kept])).toEqual([
      ["NDC", "accepted", "client-1", 1],
      ["NAP", "accepted", "client-1", 1],
    ]);
  });

  it("refuses a draft with one document, before anything is written or started", async () => {
    const id = await draftWith([doc("d1", "NDC", "NDC", ["A", "B"])]);
    const res = await start(id);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "oneDocument" });
    expect(existsSync(join(root, "python", "analyses", id, "input"))).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("waits while a document is still being read", async () => {
    const reading = { ...doc("d2", "NAP", "NAP", []), state: "reading" as const, readingAt: new Date().toISOString() };
    const id = await draftWith([doc("d1", "NDC", "NDC", ["A"]), reading]);
    const res = await start(id);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "reading" });
  });
});
