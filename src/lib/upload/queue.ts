import { spawn } from "child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, renameSync, rmSync, writeFileSync, writeSync } from "fs";
import { join } from "path";
import { BOOT_ID, jobGone } from "./boot";
import { analysesDir, pruneDrafts } from "./draft";
import { readJson, writeJsonAtomic } from "./files";

/**
 * Analyses wait in line and run one at a time: they share one model quota,
 * so several at once only make each slower and add failed retries. The line
 * is a folder of files beside the analyses; the run in progress holds a claim
 * file created exclusively, so two servers on one disk (a deploy overlaps
 * the old and the new for a moment) never start the same work twice. The
 * server works through the line when it starts, when a run ends and whenever
 * a waiting page asks. A run whose heartbeat stops goes back in line once and
 * resumes from its cache; after that it waits for "Continue".
 */

const STARTS_PER_MINUTE = 5;
const WINDOW_MS = 60_000;
const FINISHED = new Set(["completed", "failed", "interrupted"]);
const ENTRY = /^(\d+)-([0-9a-f-]{36})\.json$/;

type RunStatus = { status?: string; heartbeatAt?: string; bootId?: string; pid?: number; [key: string]: unknown };
interface Entry {
  file: string;
  id: string;
  resume: boolean;
  at: number;
}
interface Claim {
  id: string;
  bootId: string;
  pid?: number;
  claimedAt: string;
}

export type RunState = "queued" | "running" | "interrupted" | "completed" | "failed" | "missing";

const queueDir = () => join(analysesDir(), ".queue");
const claimFile = () => join(analysesDir(), ".running.json");
const runDir = (id: string) => join(analysesDir(), id);
const statusFile = (id: string) => join(runDir(id), "output", "status.json");

const statusOf = (id: string) => readJson<RunStatus>(statusFile(id));

/** A status for a new attempt: what the last attempt said, without the
 *  heartbeat, process and boot it ran under (they would make the new attempt
 *  look gone before its Python has written anything). Its footprint stays,
 *  for the resume to book. */
function forNextAttempt(status: RunStatus | null): RunStatus {
  const next: RunStatus = { ...status };
  delete next.heartbeatAt;
  delete next.pid;
  delete next.bootId;
  return next;
}
const setStatus = (id: string, status: RunStatus) => writeJsonAtomic(statusFile(id), status);
const claim = () => readJson<Claim>(claimFile());

function entries(): Entry[] {
  if (!existsSync(queueDir())) return [];
  return readdirSync(queueDir())
    .map((name) => {
      const m = ENTRY.exec(name);
      if (!m) return null;
      const body = readJson<{ resume?: boolean }>(join(queueDir(), name));
      return { file: join(queueDir(), name), id: m[2], resume: body?.resume === true, at: Number(m[1]) };
    })
    .filter((e): e is Entry => e !== null)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/** Put an analysis in line (once). */
export function enqueue(id: string, opts: { resume?: boolean } = {}): void {
  if (entries().some((e) => e.id === id)) return;
  writeJsonAtomic(join(queueDir(), `${Date.now()}-${id}.json`), { id, resume: opts.resume === true });
}

function release(id: string): void {
  if (claim()?.id === id) rmSync(claimFile(), { force: true });
}

/** A run that ended or went quiet before it finished: back in line once,
 *  to resume from its cache, then interrupted until someone continues it. */
function interrupt(id: string): void {
  const status = forNextAttempt(statusOf(id));
  const marker = join(runDir(id), "resumed");
  if (existsSync(marker)) {
    setStatus(id, { ...status, status: "interrupted" });
    return;
  }
  writeFileSync(marker, new Date().toISOString());
  setStatus(id, { ...status, status: "queued" });
  enqueue(id, { resume: true });
}

function spawnRun(id: string, resume: boolean): number | undefined {
  const input = join(runDir(id), "input");
  const output = join(runDir(id), "output");
  const child = spawn(
    "uv",
    ["run", "python", "-m", "src.run_analysis", "--targets-file", "targets.json", ...(resume ? ["--resume"] : [])],
    {
      cwd: join(process.cwd(), "python"),
      env: {
        ...process.env,
        CPC_DATA_DIR: input,
        CPC_OUTPUT_DIR: output,
        // A user upload in the footprint ledger, tied to its analysis id.
        CPC_RUN_SOURCE: "user_pipeline",
        CPC_RUN_ID: id,
        CPC_BOOT_ID: BOOT_ID,
        CPC_CACHE_MANIFEST: join(output, "cache-manifest.txt"),
      },
      stdio: "ignore",
      detached: true,
    },
  );
  let ended = false;
  const end = (failedToStart: boolean) => {
    if (ended) return;
    ended = true;
    try {
      const status = statusOf(id);
      if (failedToStart) setStatus(id, { ...(status ?? {}), status: "failed", error: "The analysis could not be started." });
      else if (!status?.status || !FINISHED.has(status.status)) interrupt(id);
      release(id);
      pump();
    } catch (err) {
      console.error("Queue after a run ended:", err instanceof Error ? err.message : err);
    }
  };
  child.on("exit", () => end(false));
  child.on("error", () => end(true));
  child.unref();
  return child.pid;
}

/** The claimed run, if it finished or is gone, gives up its claim; a gone
 *  one goes back in line once. */
export function recover(now = new Date()): void {
  const held = claim();
  if (!held) return;
  const status = statusOf(held.id);
  if (status?.status && FINISHED.has(status.status)) {
    release(held.id);
    return;
  }
  // Heard from last: the run's own heartbeat, or the claim when it is newer
  // (a run just started has written nothing yet).
  const beat = Date.parse(status?.heartbeatAt ?? "");
  const claimed = Date.parse(held.claimedAt);
  const job =
    Number.isFinite(beat) && !(beat < claimed)
      ? { heartbeatAt: status?.heartbeatAt, bootId: status?.bootId, pid: status?.pid }
      : { heartbeatAt: held.claimedAt, bootId: held.bootId, pid: held.pid };
  if (!jobGone(job, held.claimedAt, now)) return;
  // Taken over by renaming first: of two servers, only one gets it.
  const taken = `${claimFile()}.${BOOT_ID}.${Date.now()}`;
  try {
    renameSync(claimFile(), taken);
  } catch {
    return;
  }
  rmSync(taken, { force: true });
  interrupt(held.id);
}

/** Start the next analysis in line when none is running. */
export function pump(): string | null {
  recover();
  if (existsSync(claimFile())) return null;
  const next = entries()[0];
  if (!next) return null;
  let fd: number;
  try {
    fd = openSync(claimFile(), "wx");
  } catch {
    return null;
  }
  const claimedAt = new Date().toISOString();
  try {
    writeSync(fd, JSON.stringify({ id: next.id, bootId: BOOT_ID, claimedAt }));
  } finally {
    closeSync(fd);
  }
  rmSync(next.file, { force: true });
  const pid = spawnRun(next.id, next.resume);
  if (claim()?.id === next.id) writeJsonAtomic(claimFile(), { id: next.id, bootId: BOOT_ID, pid, claimedAt });
  return next.id;
}

/** Where an analysis stands, and how many are ahead of it in line. */
export function runState(id: string): { state: RunState; ahead: number } {
  const status = statusOf(id);
  if (!status) return { state: "missing", ahead: 0 };
  const at = entries().findIndex((e) => e.id === id);
  if (at >= 0) return { state: "queued", ahead: at + (claim() ? 1 : 0) };
  if (status.status === "completed" || status.status === "failed" || status.status === "interrupted") {
    return { state: status.status, ahead: 0 };
  }
  return { state: "running", ahead: 0 };
}

/** Analyses running or waiting: the ones a new start would wait behind. */
export function queueLength(): number {
  return entries().length + (claim() ? 1 : 0);
}

/** An interrupted or failed analysis back in line, to resume from its cache. */
export function continueRun(id: string): boolean {
  const status = statusOf(id);
  if (status?.status !== "interrupted" && status?.status !== "failed") return false;
  setStatus(id, { ...forNextAttempt(status), status: "queued" });
  enqueue(id, { resume: true });
  pump();
  return true;
}

let starts: number[] = [];

/** At most five starts a minute, from any start route of this server. */
export function allowStart(now = Date.now()): boolean {
  starts = starts.filter((t) => now - t < WINDOW_MS);
  if (starts.length >= STARTS_PER_MINUTE) return false;
  starts.push(now);
  return true;
}

/** At server start: old drafts go, a run cut short by the restart goes back
 *  in line, the line moves. Never throws. */
export function bootQueue(): void {
  try {
    mkdirSync(analysesDir(), { recursive: true });
    pruneDrafts();
    recover();
    pump();
  } catch (err) {
    console.warn("Upload queue could not start:", err instanceof Error ? err.message : err);
  }
}

const WATCH_MS = 30_000;

/** Look at the line every 30 seconds: after a deploy, the run the old server
 *  was doing goes quiet only once the old server has stopped, and nobody may
 *  be looking at a waiting page by then. Returns a stop function. */
export function watchQueue(): () => void {
  const timer = setInterval(() => {
    try {
      recover();
      pump();
    } catch (err) {
      console.warn("Queue look failed:", err instanceof Error ? err.message : err);
    }
  }, WATCH_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
