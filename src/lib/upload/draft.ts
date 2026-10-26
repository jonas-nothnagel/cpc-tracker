import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import type { AnalyzeBody, TargetInput } from "./analysis-inputs";
import { cleanText, isValidCode } from "./documents";
import { OWN_AREA_LIMITS, type OwnLensInput } from "./own-areas";
import type { Draft, DraftChange, DraftTarget } from "./types";

/**
 * An upload's draft, kept on the server under its analysis id
 * (`python/analyses/{id}/draft.json`, documents beside it), so a reload, a
 * closed tab or a long document loses nothing. Every change is a small
 * operation on one field; the file is replaced whole, never half written.
 */

const DRAFT_FILE = "draft.json";
const KEEP_DAYS = 30;
const LIMITS = { country: 80, name: 120, label: 80, text: 4000 } as const;
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

/** Clean user text, at most `max` characters. */
function cut(raw: unknown, max: number): string {
  return Array.from(cleanText(raw)).slice(0, max).join("").trim();
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

function cleanLens(lens: OwnLensInput): OwnLensInput {
  const L = OWN_AREA_LIMITS;
  const source = cut(lens.source, L.source);
  return {
    name: cut(lens.name, L.name),
    ...(source ? { source } : {}),
    areas: (Array.isArray(lens.areas) ? lens.areas : []).slice(0, L.areas).map((a) => ({
      name: cut(a?.name, L.areaName),
      description: cut(a?.description, L.description),
    })),
  };
}

function applyChange(draft: Draft, c: DraftChange): void {
  switch (c.op) {
    case "country":
      draft.country = cut(c.value, LIMITS.country);
      return;
    case "document": {
      const doc = draft.documents.find((d) => d.id === c.id);
      if (!doc) return;
      const name = cut(c.name, LIMITS.name);
      if (name) doc.name = name;
      if (typeof c.code === "string") {
        const code = c.code.trim();
        const taken = draft.documents.some((d) => d.id !== doc.id && d.code.toUpperCase() === code.toUpperCase());
        if (isValidCode(code) && !taken) doc.code = code;
      }
      return;
    }
    case "removeDocument":
      draft.documents = draft.documents.filter((d) => d.id !== c.id);
      return;
    case "target": {
      const doc = draft.documents.find((d) => d.id === c.docId);
      const target = doc?.state === "read" ? doc.targets.find((t) => t.key === c.key) : undefined;
      if (!target) return;
      const text = cut(c.text, LIMITS.text);
      if (text) target.text = text;
      if (c.removed === true) target.removed = true;
      if (c.removed === false) delete target.removed;
      return;
    }
    case "addTarget": {
      const doc = draft.documents.find((d) => d.id === c.docId);
      const text = cut(c.text, LIMITS.text);
      if (doc?.state !== "read" || !text) return;
      const n = doc.targets.filter((t) => t.added).length + 1;
      doc.targets.push({
        key: `${doc.id}-a${n}`,
        label: cut(c.label, LIMITS.label) || `${doc.code} ${doc.targets.length + 1}`,
        text,
        added: true,
      });
      return;
    }
    case "ownLens":
      draft.ownLens = c.value ? cleanLens(c.value) : null;
      return;
    case "removeBtr":
      draft.btr = null;
      return;
  }
}

/** Apply the page's edits; a started draft takes none. */
export function applyChanges(draft: Draft, changes: DraftChange[]): void {
  if (draft.started) return;
  for (const change of changes) applyChange(draft, change);
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
