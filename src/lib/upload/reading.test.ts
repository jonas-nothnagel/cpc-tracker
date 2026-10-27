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

let pid = 41000;
beforeEach(() => {
  vi.resetModules();
  vi.spyOn(process, "cwd").mockReturnValue(mkdtempSync(join(tmpdir(), "cpc-reading-")));
  spawnMock.mockImplementation(() => Object.assign(new EventEmitter(), { unref: () => undefined, pid: pid++ }));
});
afterEach(() => {
  vi.restoreAllMocks();
  spawnMock.mockReset();
});

/** A draft with `n` documents added from PDFs, as the documents route leaves them. */
async function draftWith(n: number) {
  const { createDraft, documentDir, updateDraft } = await import("./draft");
  const draft = createDraft({ country: "Tonga", locale: "en" });
  updateDraft(draft.id, (d) => {
    for (let i = 1; i <= n; i++) {
      const dir = documentDir(draft.id, `d${i}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "source.pdf"), "%PDF-1.4");
      d.documents.push({ id: `d${i}`, source: "read", fileName: `D${i}.pdf`, name: `Document ${i}`, code: `D${i}`, state: "added", targets: [] });
    }
    d.nextDoc = n + 1;
  });
  return { id: draft.id, dir: (docId: string) => documentDir(draft.id, docId) };
}

const status = (dir: string, body: Record<string, unknown>) =>
  writeFileSync(join(dir, "status.json"), JSON.stringify(body));
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

describe("startReading", () => {
  it("reads two documents at a time and keeps the rest in line", async () => {
    const { id } = await draftWith(3);
    const { startReading } = await import("./reading");
    const draft = startReading(id)!;
    expect(draft.documents.map((d) => d.state)).toEqual(["reading", "reading", "queued"]);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args.slice(0, 4)).toEqual(["run", "python", "-m", "src.extract"]);
    expect(args).toEqual(expect.arrayContaining(["--doc-type", "Document 1", "--output-language", "en", "--status-file"]));
  });
});

describe("the reading job", () => {
  it("is recorded beside the document, so a removal can stop it", async () => {
    const { id, dir } = await draftWith(1);
    const { BOOT_ID } = await import("./boot");
    const { startReading } = await import("./reading");
    startReading(id);
    const child = spawnMock.mock.results[0].value as { pid: number };
    expect(JSON.parse(readFileSync(join(dir("d1"), "job.json"), "utf8"))).toEqual({ pid: child.pid, bootId: BOOT_ID });
  });

  it("is stopped whole when its document is removed: the launcher and the reading under it", async () => {
    const { id, dir } = await draftWith(1);
    const { spawn } = await vi.importActual<typeof import("child_process")>("child_process");
    const { BOOT_ID, processAlive } = await import("./boot");
    const { stopReading } = await import("./reading");
    // A launcher with a child of its own, in its own process group, as uv runs Python.
    const job = spawn("sh", ["-c", "sleep 30 & wait"], { detached: true, stdio: "ignore" });
    writeFileSync(join(dir("d1"), "job.json"), JSON.stringify({ pid: job.pid, bootId: BOOT_ID }));
    const exited = new Promise((resolve) => job.on("exit", resolve));
    stopReading(id, "d1");
    await exited;
    expect(processAlive(job.pid!)).toBe(false);
  });

  it("is left alone when another server started it: its process id says nothing here", async () => {
    const { id, dir } = await draftWith(1);
    const { spawn } = await vi.importActual<typeof import("child_process")>("child_process");
    const { processAlive } = await import("./boot");
    const { stopReading } = await import("./reading");
    const job = spawn("sleep", ["30"], { detached: true, stdio: "ignore" });
    writeFileSync(join(dir("d1"), "job.json"), JSON.stringify({ pid: job.pid, bootId: "another-server" }));
    stopReading(id, "d1");
    expect(processAlive(job.pid!)).toBe(true);
    process.kill(-job.pid!, "SIGTERM");
  });

  it("that ends without a last word is gone at once: read again once, then failed", async () => {
    const { id, dir } = await draftWith(1);
    const { readDraft } = await import("./draft");
    const { startReading } = await import("./reading");
    startReading(id);
    status(dir("d1"), { state: "reading", heartbeatAt: new Date().toISOString(), bootId: "x", pid: 1 });
    (spawnMock.mock.results[0].value as EventEmitter).emit("exit", 1);
    expect(readDraft(id)!.documents[0]).toMatchObject({ state: "reading", attempts: 2 });
    expect(spawnMock).toHaveBeenCalledTimes(2);
    (spawnMock.mock.results[1].value as EventEmitter).emit("exit", 1);
    expect(readDraft(id)!.documents[0].state).toBe("failed");
  });

  it("that ends after a newer job took over leaves the newer one reading", async () => {
    const { id, dir } = await draftWith(1);
    const { readDraft } = await import("./draft");
    const { refreshReading, startReading } = await import("./reading");
    startReading(id);
    // The first job went quiet and was started again; then it finally ends.
    status(dir("d1"), { state: "reading", heartbeatAt: ago(180_000), bootId: "other", pid: 1 });
    refreshReading(id);
    expect(spawnMock).toHaveBeenCalledTimes(2);
    (spawnMock.mock.results[0].value as EventEmitter).emit("exit", 1);
    expect(readDraft(id)!.documents[0]).toMatchObject({ state: "reading", attempts: 2 });
  });
});

describe("refreshReading", () => {
  it("takes in a finished reading, deletes the source and starts the next document", async () => {
    const { id, dir } = await draftWith(3);
    const { refreshReading, startReading } = await import("./reading");
    startReading(id);
    status(dir("d1"), { state: "done", items: 2, heartbeatAt: ago(1000) });
    writeFileSync(
      join(dir("d1"), "extracted.json"),
      JSON.stringify([
        { text: "Restore 30% of wetlands", label: "Target 1", pageNumbers: [12] },
        { text: "Protect mangroves", label: "2.1", language: "es", textOriginal: "Proteger los manglares" },
      ]),
    );
    writeFileSync(join(dir("d1"), "extracted.json.footprint.json"), JSON.stringify({ co2_geq: 1.5, call_count: 9 }));
    const draft = refreshReading(id)!;
    const d1 = draft.documents[0];
    expect(d1.state).toBe("read");
    expect(d1.targets).toEqual([
      { key: "d1-1", label: "", text: "Restore 30% of wetlands", initialText: "Restore 30% of wetlands", initialLabel: "", pageNumbers: [12] },
      {
        key: "d1-2",
        label: "2.1",
        text: "Protect mangroves",
        initialText: "Protect mangroves",
        initialLabel: "2.1",
        language: "es",
        textOriginal: "Proteger los manglares",
        textOriginalSource: "source",
      },
    ]);
    expect(draft.footprint).toMatchObject({ co2_geq: 1.5, call_count: 9 });
    expect(existsSync(join(dir("d1"), "source.pdf"))).toBe(false);
    expect(draft.documents[2].state).toBe("reading");
    expect(spawnMock).toHaveBeenCalledTimes(3);
  });

  it("shows the parts read so far", async () => {
    const { id, dir } = await draftWith(1);
    const { refreshReading, startReading } = await import("./reading");
    startReading(id);
    status(dir("d1"), { state: "reading", part: 3, parts: 9, heartbeatAt: ago(1000) });
    expect(refreshReading(id)!.documents[0]).toMatchObject({ state: "reading", part: 3, parts: 9 });
  });

  it("waits through a quiet minute, then starts a gone job again once", async () => {
    const { id, dir } = await draftWith(1);
    const { refreshReading, startReading } = await import("./reading");
    startReading(id);
    status(dir("d1"), { state: "reading", heartbeatAt: ago(90_000), bootId: "other", pid: 1 });
    expect(refreshReading(id)!.documents[0].state).toBe("reading");
    status(dir("d1"), { state: "reading", heartbeatAt: ago(180_000), bootId: "other", pid: 1 });
    const again = refreshReading(id)!.documents[0];
    expect(again).toMatchObject({ state: "reading", attempts: 2 });
    expect(spawnMock).toHaveBeenCalledTimes(2);
    status(dir("d1"), { state: "reading", heartbeatAt: ago(180_000), bootId: "other", pid: 1 });
    expect(refreshReading(id)!.documents[0].state).toBe("failed");
  });

  it("tells a scanned PDF apart from a reading that failed", async () => {
    const { id, dir } = await draftWith(2);
    const { refreshReading, startReading } = await import("./reading");
    startReading(id);
    status(dir("d1"), { state: "failed", code: "NO_TEXT_LAYER" });
    status(dir("d2"), { state: "failed", code: "ERROR" });
    expect(refreshReading(id)!.documents.map((d) => d.state)).toEqual(["noText", "failed"]);
  });
});
