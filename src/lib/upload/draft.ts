import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { AnalyzeBody, TargetInput } from "./analysis-inputs";
import { LIMITS, cut } from "./changes";
import type { Draft, DraftTarget } from "./types";

export { applyChanges } from "./changes";

/**
 * An upload's draft, kept on the server under its analysis id
 * (`python/analyses/{id}/draft.json`, documents beside it), so a reload, a
 * closed tab or a long document loses nothing. Every change is a small
 * operation on one field; the file is replaced whole, never half written.
 */

const DRAFT_FILE = "draft.json";
const KEEP_DAYS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Where analyses and drafts live, read at call time. */
export function analysesDir(): string {
  return join(process.cwd(), "python", "analyses");
}

export function isDraftId(id: string): boolean {
  return UUID.test(id);
}

export function documentDir(id: string, docId: string): string {
  return join(analysesDir(), id, "documents", docId);
}

function draftFile(id: string): string {
  return join(analysesDir(), id, DRAFT_FILE);
}

function writeDraft(draft: Draft): void {
  const path = draftFile(draft.id);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(draft, null, 2));
  renameSync(tmp, path);
}

export function createDraft(input: { country?: string; locale: string }): Draft {
  const id = randomUUID();
  mkdirSync(join(analysesDir(), id), { recursive: true });
  const now = new Date().toISOString();
  const draft: Draft = {
    id,
    createdAt: now,
    updatedAt: now,
    country: cut(input.country, LIMITS.country),
    locale: input.locale,
    documents: [],
    btr: null,
    ownLens: null,
    footprint: null,
    started: false,
    nextDoc: 1,
  };
  writeDraft(draft);
  return draft;
}

export function readDraft(id: string): Draft | null {
  if (!isDraftId(id)) return null;
  try {
    const draft = JSON.parse(readFileSync(draftFile(id), "utf8"));
    return draft && typeof draft === "object" && draft.id === id && Array.isArray(draft.documents) ? draft : null;
  } catch {
    return null;
  }
}

/** Read, change and write back in one synchronous stretch: within one server
 *  process no other update can run in between. */
export function updateDraft(id: string, fn: (draft: Draft) => void): Draft | null {
  const draft = readDraft(id);
  if (!draft) return null;
  fn(draft);
  draft.updatedAt = new Date().toISOString();
  writeDraft(draft);
  return draft;
}

function toTargetInput(code: string, t: DraftTarget): TargetInput {
  return {
    text: t.text,
    sourceDocument: code,
    sourceLabel: t.label,
    ...(t.activities ? { activities: t.activities } : {}),
    ...(t.actions ? { actions: t.actions } : {}),
    ...(t.textOriginal ? { textOriginal: t.textOriginal } : {}),
    ...(t.labelOriginal ? { sourceLabelOriginal: t.labelOriginal } : {}),
    ...(t.language ? { language: t.language } : {}),
    ...(t.textOriginalSource ? { textOriginalSource: t.textOriginalSource } : {}),
    ...(t.sources?.length ? { sources: t.sources } : {}),
    ...(t.textCleanup ? { textCleanup: t.textCleanup } : {}),
    ...(t.pageNumbers?.length ? { pageNumbers: t.pageNumbers } : {}),
    ...(t._provenanceFlag ? { _provenanceFlag: t._provenanceFlag } : {}),
  };
}

/** The analysis a draft asks for: the kept targets of every read document,
 *  filed under its code, with the documents' names. */
export function toAnalyzeBody(draft: Draft): AnalyzeBody {
  const docs = draft.documents.filter((d) => d.state === "read" && d.targets.some((t) => !t.removed));
  return {
    country: draft.country,
    locale: draft.locale,
    documents: docs.map((d) => ({ code: d.code, name: d.name })),
    targets: docs.flatMap((d) => d.targets.filter((t) => !t.removed).map((t) => toTargetInput(d.code, t))),
    ...(draft.btr ? { btrData: draft.btr.data } : {}),
    ...(draft.ownLens ? { ownLens: draft.ownLens } : {}),
    ...(draft.footprint ? { initialFootprint: { ...draft.footprint } } : {}),
  };
}

/** Remove drafts nobody started and nobody touched for 30 days. Analyses
 *  (and drafts that started one) stay under their address. */
export function pruneDrafts(now = new Date()): string[] {
  const root = analysesDir();
  if (!existsSync(root)) return [];
  const removed: string[] = [];
  for (const id of readdirSync(root)) {
    const draft = readDraft(id);
    if (!draft || draft.started) continue;
    if (now.getTime() - Date.parse(draft.updatedAt) > KEEP_DAYS * 86_400_000) {
      rmSync(join(root, id), { recursive: true, force: true });
      removed.push(id);
    }
  }
  return removed;
}
