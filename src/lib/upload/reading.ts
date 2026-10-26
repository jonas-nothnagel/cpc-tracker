import { spawn } from "child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { isGenericLabel } from "@/lib/upload-helpers";
import { BOOT_ID, jobGone } from "./boot";
import { promptLabel } from "./documents";
import { documentDir, updateDraft } from "./draft";
import type { Draft, DraftDocument, DraftTarget, ExtractionFootprint } from "./types";

/**
 * Documents read in the background, two at a time: each reading is its own
 * detached job (`src.extract --status-file`), so no request stays open and a
 * long document never meets a proxy's time limit. The server reads the
 * jobs' status files whenever the page asks, takes in finished readings,
 * starts the next documents, and starts a job that is gone once more.
 */

export const READ_AT_ONCE = 2;
/** A document is read at most this many times before it counts as failed. */
const MAX_ATTEMPTS = 2;

interface ReadingStatus {
  state?: "reading" | "done" | "failed";
  part?: number;
  parts?: number;
  code?: string;
  pid?: number;
  bootId?: string;
  heartbeatAt?: string;
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function sourceFile(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const name = readdirSync(dir).find((f) => f.startsWith("source."));
  return name ? join(dir, name) : null;
}

function removeSource(dir: string): void {
  const source = sourceFile(dir);
  if (source) rmSync(source, { force: true });
}

const EMPTY_FOOTPRINT: ExtractionFootprint = {
  energy_wh: 0,
  water_ml: 0,
  co2_geq: 0,
  minerals_ugsbeq: 0,
  energy_wh_min: 0,
  energy_wh_max: 0,
  water_ml_min: 0,
  water_ml_max: 0,
  co2_geq_min: 0,
  co2_geq_max: 0,
  minerals_ugsbeq_min: 0,
  minerals_ugsbeq_max: 0,
  call_count: 0,
  tracked_call_count: 0,
  cached_call_count: 0,
};

/** The readings' footprint so far plus one more reading's. A reading
 *  without bounds adds its midpoint to both ends, the tracker's
 *  conservative seeding rule. */
export function addFootprint(a: ExtractionFootprint | null, b: Partial<ExtractionFootprint>): ExtractionFootprint {
  const sum = { ...(a ?? EMPTY_FOOTPRINT) };
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  for (const key of ["energy_wh", "water_ml", "co2_geq", "minerals_ugsbeq"] as const) {
    sum[key] += n(b[key]);
    sum[`${key}_min`] += n(b[`${key}_min`] ?? b[key]);
    sum[`${key}_max`] += n(b[`${key}_max`] ?? b[key]);
  }
  for (const key of ["call_count", "tracked_call_count", "cached_call_count"] as const) sum[key] += n(b[key]);
  return sum;
}

type RawItem = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** A reading's items as draft targets. Payloads from before English-first
 *  extraction put the original in `text` and the English in `text_eng`. */
export function toDraftTargets(docId: string, items: unknown[]): DraftTarget[] {
  const targets: DraftTarget[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as RawItem;
    const legacy = !!item.language && !!item.text_eng && !item.textOriginal;
    const text = (legacy ? str(item.text_eng) : str(item.text))?.trim();
    if (!text) continue;
    const rawLabel = (legacy ? str(item.label_eng) || str(item.label) : str(item.label)) ?? "";
    const label = isGenericLabel(rawLabel) ? "" : rawLabel.trim();
    const language = str(item.language);
    const textOriginal = legacy ? str(item.text) : str(item.textOriginal);
    const labelOriginal = legacy ? str(item.label) : str(item.labelOriginal);
    targets.push({
      key: `${docId}-${targets.length + 1}`,
      label,
      text,
      initialText: text,
      initialLabel: label,
      ...(Array.isArray(item.pageNumbers) && item.pageNumbers.length ? { pageNumbers: item.pageNumbers as number[] } : {}),
      ...(language ? { language } : {}),
      ...(textOriginal ? { textOriginal } : {}),
      ...(labelOriginal ? { labelOriginal } : {}),
      ...(language ? { textOriginalSource: item.textOriginalSource === "machine" ? "machine" : "source" } : {}),
      ...(Array.isArray(item.sources) && item.sources.length ? { sources: item.sources as DraftTarget["sources"] } : {}),
      ...(str(item.textCleanup) ? { textCleanup: item.textCleanup as DraftTarget["textCleanup"] } : {}),
      ...(str(item.activities) ? { activities: str(item.activities) } : {}),
      ...(str(item._provenanceFlag) ? { _provenanceFlag: str(item._provenanceFlag) } : {}),
    });
  }
  return targets;
}

/** Start reading one document; false when its file is gone. */
function spawnReading(id: string, doc: DraftDocument): boolean {
  const dir = documentDir(id, doc.id);
  const source = sourceFile(dir);
  if (!source) return false;
  rmSync(join(dir, "status.json"), { force: true });
  const child = spawn(
    "uv",
    [
      "run", "python", "-m", "src.extract",
      "--file", source,
      "--doc-type", promptLabel(doc.name) || "policy",
      "--source-document", doc.code,
      "--output", join(dir, "extracted.json"),
      "--output-language", "en",
      "--status-file", join(dir, "status.json"),
    ],
    {
      cwd: join(process.cwd(), "python"),
      env: { ...process.env, CPC_RUN_ID: id, CPC_BOOT_ID: BOOT_ID },
      stdio: "ignore",
      detached: true,
    },
  );
  const next = () => {
    try {
      refreshReading(id);
    } catch (err) {
      console.error("Reading refresh failed:", err instanceof Error ? err.message : err);
    }
  };
  child.on("exit", next);
  child.on("error", next);
  child.unref();
  return true;
}

/** Keep up to READ_AT_ONCE documents reading, in the order they were added. */
function pump(id: string, draft: Draft): void {
  let reading = draft.documents.filter((d) => d.state === "reading").length;
  for (const doc of draft.documents) {
    if (reading >= READ_AT_ONCE) break;
    if (doc.state !== "queued") continue;
    delete doc.part;
    delete doc.parts;
    if (!spawnReading(id, doc)) {
      doc.state = "failed";
      continue;
    }
    doc.state = "reading";
    doc.attempts = (doc.attempts ?? 0) + 1;
    doc.readingAt = new Date().toISOString();
    reading++;
  }
}

function takeIn(draft: Draft, doc: DraftDocument, dir: string): void {
  doc.targets = toDraftTargets(doc.id, readJson<unknown[]>(join(dir, "extracted.json")) ?? []);
  const meta = readJson<{ documentWarnings?: { code?: string; emptyPages?: number; pages?: number }[] }>(
    join(dir, "extracted.json.meta.json"),
  );
  const partial = meta?.documentWarnings?.find((w) => w?.code === "PARTIAL_TEXT_LAYER");
  if (partial && typeof partial.emptyPages === "number" && typeof partial.pages === "number") {
    doc.emptyPages = partial.emptyPages;
    doc.pages = partial.pages;
  }
  const footprint = readJson<Partial<ExtractionFootprint>>(join(dir, "extracted.json.footprint.json"));
  if (footprint) draft.footprint = addFootprint(draft.footprint, footprint);
  doc.state = "read";
  delete doc.part;
  delete doc.parts;
  removeSource(dir);
}

/** Documents waiting or failed are read (again); a new attempt count. */
export function startReading(id: string): Draft | null {
  return updateDraft(id, (draft) => {
    if (draft.started) return;
    for (const doc of draft.documents) {
      if (doc.state === "added" || doc.state === "failed") {
        doc.state = "queued";
        doc.attempts = 0;
      }
    }
    pump(id, draft);
  });
}

/** Take in what the reading jobs have done since the last look. */
export function refreshReading(id: string, now = new Date()): Draft | null {
  return updateDraft(id, (draft) => {
    if (draft.started) return;
    for (const doc of draft.documents) {
      if (doc.state !== "reading") continue;
      const dir = documentDir(id, doc.id);
      const status = readJson<ReadingStatus>(join(dir, "status.json"));
      if (status?.state === "done") {
        takeIn(draft, doc, dir);
      } else if (status?.state === "failed") {
        doc.state = status.code === "NO_TEXT_LAYER" ? "noText" : "failed";
        delete doc.part;
        delete doc.parts;
        if (doc.state === "noText") removeSource(dir);
      } else if (jobGone(status, doc.readingAt, now)) {
        doc.state = (doc.attempts ?? 0) < MAX_ATTEMPTS ? "queued" : "failed";
      } else if (status?.state === "reading") {
        if (typeof status.part === "number") doc.part = status.part;
        if (typeof status.parts === "number") doc.parts = status.parts;
      }
    }
    pump(id, draft);
  });
}
