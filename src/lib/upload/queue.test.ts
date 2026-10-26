import { EventEmitter } from "events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, default: { ...actual, spawn: spawnMock }, spawn: spawnMock };
});

const A = "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13";
const B = "ad72aee6-4840-4586-9e6d-4da458aa5ed4";
let root = "";
let children: EventEmitter[] = [];

beforeEach(() => {
  vi.resetModules();
  root = mkdtempSync(join(tmpdir(), "cpc-queue-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
  children = [];
  spawnMock.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: () => undefined, pid: 50000 + children.length });
    children.push(child);
    return child;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  spawnMock.mockReset();
});

/** An analysis whose inputs are written, with its status file. */
function analysis(id: string, status: Record<string, unknown> = { status: "queued" }) {
  const out = join(root, "python", "analyses", id, "output");
  mkdirSync(out, { recursive: true });
  mkdirSync(join(root, "python", "analyses", id, "input"), { recursive: true });
  writeFileSync(join(out, "status.json"), JSON.stringify(status));
}
const statusOf = (id: string) =>
  JSON.parse(readFileSync(join(root, "python", "analyses", id, "output", "status.json"), "utf8"));
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("the queue", () => {
  it("runs one analysis at a time, the next one waits in line", async () => {
    const { enqueue, pump, runState, queueLength } = await import("./queue");
    analysis(A);
    analysis(B);
    enqueue(A);
    enqueue(B);
    expect(pump()).toBe(A);
    expect(pump()).toBeNull();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(runState(A)).toEqual({ state: "running", ahead: 0 });
    expect(runState(B)).toEqual({ state: "queued", ahead: 1 });
    expect(queueLength()).toBe(2);
    const env = spawnMock.mock.calls[0][2].env;
    expect(env).toMatchObject({ CPC_RUN_ID: A, CPC_RUN_SOURCE: "user_pipeline" });
    expect(env.CPC_CACHE_MANIFEST).toBe(join(root, "python", "analyses", A, "output", "cache-manifest.txt"));
  });

  it("starts the next analysis when one finishes", async () => {
    const { enqueue, pump, runState } = await import("./queue");
    analysis(A);
    analysis(B);
    enqueue(A);
    enqueue(B);
    pump();
    writeFileSync(join(root, "python", "analyses", A, "output", "status.json"), JSON.stringify({ status: "completed" }));
    children[0].emit("exit", 0);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(runState(B)).toEqual({ state: "running", ahead: 0 });
  });

  it("takes an analysis in line once", async () => {
    const { enqueue, queueLength } = await import("./queue");
    analysis(A);
    enqueue(A);
    enqueue(A);
    expect(queueLength()).toBe(1);
  });
});

describe("recover", () => {
  it("puts a run whose server is gone back in line once, then calls it interrupted", async () => {
    const { enqueue, pump, recover, runState } = await import("./queue");
    analysis(A);
    enqueue(A);
    pump();
    const gone = { status: "running", heartbeatAt: ago(180_000), bootId: "another-server", pid: 1, footprint: { call_count: 9 } };
    writeFileSync(join(root, "python", "analyses", A, "output", "status.json"), JSON.stringify(gone));
    recover();
    // Back in line with --resume, its footprint kept for the resume to book.
    expect(statusOf(A)).toMatchObject({ status: "queued", footprint: { call_count: 9 } });
    expect(pump()).toBe(A);
    expect(spawnMock.mock.calls[1][1]).toContain("--resume");
    writeFileSync(join(root, "python", "analyses", A, "output", "status.json"), JSON.stringify(gone));
    recover();
    expect(statusOf(A).status).toBe("interrupted");
    expect(runState(A).state).toBe("interrupted");
    expect(pump()).toBeNull();
  });

  it("leaves a run alone while its heartbeat is fresh", async () => {
    const { enqueue, pump, recover } = await import("./queue");
    analysis(A);
    enqueue(A);
    pump();
    writeFileSync(
      join(root, "python", "analyses", A, "output", "status.json"),
      JSON.stringify({ status: "running", heartbeatAt: ago(30_000), bootId: "another-server", pid: 1 }),
    );
    recover();
    expect(statusOf(A).status).toBe("running");
  });

  it("calls a run interrupted at once when its process ends before it finished", async () => {
    const { enqueue, pump } = await import("./queue");
    analysis(A);
    enqueue(A);
    pump();
    writeFileSync(join(root, "python", "analyses", A, "output", "status.json"), JSON.stringify({ status: "running" }));
    children[0].emit("exit", 1);
    expect(statusOf(A).status).toBe("queued");
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  it("never touches a run it did not start (runs from before the queue)", async () => {
    const { recover, runState } = await import("./queue");
    analysis(B, { status: "running", startedAt: ago(86_400_000) });
    recover();
    expect(statusOf(B).status).toBe("running");
    expect(runState(B).state).toBe("running");
  });
});

describe("continueRun", () => {
  it("starts an interrupted or failed run again from its cache, and nothing else", async () => {
    const { continueRun } = await import("./queue");
    analysis(A, { status: "interrupted", footprint: { call_count: 3 } });
    analysis(B, { status: "running" });
    expect(continueRun(A)).toBe(true);
    expect(spawnMock.mock.calls[0][1]).toContain("--resume");
    expect(continueRun(B)).toBe(false);
  });
});

describe("allowStart", () => {
  it("lets five analyses start a minute", async () => {
    const { allowStart } = await import("./queue");
    const now = Date.now();
    expect([0, 1, 2, 3, 4, 5].map((i) => allowStart(now + i))).toEqual([true, true, true, true, true, false]);
    expect(allowStart(now + 61_000)).toBe(true);
  });
});

describe("bootQueue", () => {
  it("never throws, even without an analyses folder", async () => {
    const { bootQueue } = await import("./queue");
    expect(() => bootQueue()).not.toThrow();
    expect(existsSync(join(root, "python", "analyses", ".running.json"))).toBe(false);
  });
});
