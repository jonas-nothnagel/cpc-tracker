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

  it("puts an analysis whose run could not start back at the head of the line, the claim free for the next look", async () => {
    analysis(A);
    analysis(B);
    const { enqueue, pump, queueLength } = await import("./queue");
    enqueue(A);
    enqueue(B);
    spawnMock.mockImplementationOnce(() => {
      throw new Error("spawn EAGAIN");
    });
    expect(pump()).toBeNull();
    expect(existsSync(join(root, "python", "analyses", ".running.json"))).toBe(false);
    expect(queueLength()).toBe(2);
    // The next look starts it, as a first attempt, ahead of the other.
    expect(pump()).toBe(A);
    expect(spawnMock.mock.calls[1][1]).not.toContain("--resume");
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
    // Four minutes on, nothing more was heard from it.
    recover(new Date(Date.now() + 240_000));
    // Back in line with --resume, its footprint kept for the resume to book.
    expect(statusOf(A)).toMatchObject({ status: "queued", footprint: { call_count: 9 } });
    expect(pump()).toBe(A);
    expect(spawnMock.mock.calls[1][1]).toContain("--resume");
    // The resumed run goes quiet too: four minutes on, it is interrupted for good.
    recover(new Date(Date.now() + 240_000));
    expect(statusOf(A).status).toBe("interrupted");
    expect(runState(A).state).toBe("interrupted");
    expect(pump()).toBeNull();
  });

  it("books the calls of a run that stopped for good at once, since a Continue may never come, and only once", async () => {
    vi.stubEnv("CPC_LEDGER_DIR", join(root, "ledger"));
    const { enqueue, pump, recover } = await import("./queue");
    analysis(A);
    enqueue(A);
    pump();
    const row = { model: "gpt-5.4", source: "measured", call_count: 30, cached_call_count: 4, energy_wh: 12.5, water_ml: 40, co2_geq: 5.25, minerals_ugsbeq: 1.5 };
    const quiet = (pid: number) => ({
      status: "running",
      heartbeatAt: ago(180_000),
      bootId: "another-server",
      pid,
      footprint: { call_count: 30, by_model: [row] },
    });
    writeFileSync(join(root, "python", "analyses", A, "output", "status.json"), JSON.stringify(quiet(1)));
    recover(new Date(Date.now() + 240_000));
    pump();
    // The resume would book the first attempt; here the resumed attempt goes quiet too.
    writeFileSync(join(root, "python", "analyses", A, "output", "status.json"), JSON.stringify(quiet(2)));
    recover(new Date(Date.now() + 240_000));
    expect(statusOf(A)).toMatchObject({ status: "interrupted", footprintBooked: true });
    recover(new Date(Date.now() + 480_000));
    const rows = readFileSync(join(root, "ledger", "footprint-ledger.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ component: "user_pipeline", run_id: A, model: "gpt-5.4", call_count: 30, cached_call_count: 4, co2_geq: 5.25, region: "USA", country: null });
    vi.unstubAllEnvs();
  });

  it("keeps a resumed run while its Python is still starting, and the next analysis waits", async () => {
    // A deploy: the old container's run went quiet three minutes ago.
    analysis(A, { status: "running", step: 5, heartbeatAt: ago(180_000), bootId: "old-container", pid: 4242, footprint: { call_count: 900 } });
    writeFileSync(
      join(root, "python", "analyses", ".running.json"),
      JSON.stringify({ id: A, bootId: "old-container", pid: 4242, claimedAt: ago(1_200_000) }),
    );
    analysis(B);
    const { enqueue, pump, recover, runState } = await import("./queue");
    recover();
    expect(pump()).toBe(A);
    enqueue(B);
    // The waiting page's next look, before the resumed Python has written anything.
    recover();
    pump();
    expect(runState(A).state).toBe("running");
    expect(runState(B)).toEqual({ state: "queued", ahead: 1 });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    // The footprint of the attempt that stopped stays for the resume to book.
    expect(statusOf(A)).toMatchObject({ footprint: { call_count: 900 } });
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

describe("watchQueue", () => {
  it("looks at the line every 30 seconds, so a run cut short by a deploy resumes with nobody watching", async () => {
    vi.useFakeTimers();
    try {
      const { enqueue, watchQueue } = await import("./queue");
      analysis(A);
      const stop = watchQueue();
      enqueue(A);
      expect(spawnMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(spawnMock).toHaveBeenCalledTimes(1);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
