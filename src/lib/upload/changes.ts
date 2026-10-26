import { cleanText, isValidCode } from "./documents";
import { OWN_AREA_LIMITS, type OwnLensInput } from "./own-areas";
import type { Draft, DraftChange } from "./types";

/**
 * The page's edits to a draft, one field each. Client-safe: the page applies
 * an edit at once and the server applies the same rules when it arrives.
 */

export const LIMITS = { country: 80, name: 120, label: 80, text: 4000 } as const;

/** Clean user text, at most `max` characters. */
export function cut(raw: unknown, max: number): string {
  return Array.from(cleanText(raw)).slice(0, max).join("").trim();
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
