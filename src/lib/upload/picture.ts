import { clip } from "@/lib/brief/text";
import { MAX_ITEMS } from "./limits";
import type { Draft } from "./types";

/** One group of dots in the builder column's picture of the analysis. */
export type PictureGroup =
  | { kind: "document"; key: string; /** The document's place in the draft, for its colour. */ index: number; name: string; count: number }
  | { kind: "actions"; key: "actions"; count: number }
  | { kind: "free"; key: "free"; count: number };

/**
 * The analysis as the builder column draws it: one dot per kept target, by
 * document in the draft's order, then the reported actions, then the room
 * left under the limit. Client-safe.
 */
export function analysisPicture(draft: Draft | null, max = MAX_ITEMS): PictureGroup[] {
  const groups: PictureGroup[] = [];
  let items = 0;
  (draft?.documents ?? []).forEach((doc, index) => {
    if (doc.state !== "read") return;
    const count = doc.targets.filter((t) => !t.removed).length;
    if (count === 0) return;
    groups.push({ kind: "document", key: doc.id, index, name: doc.name, count });
    items += count;
  });
  const actions = draft?.btr?.actions ?? 0;
  if (actions > 0) {
    groups.push({ kind: "actions", key: "actions", count: actions });
    items += actions;
  }
  if (items < max) groups.push({ kind: "free", key: "free", count: max - items });
  return groups;
}

/**
 * The targets read so far, as the moving text behind the page's title:
 * dealt across the read documents in turn, so neighbouring lines come from
 * different documents, as the brief's landing deals its commitments.
 */
export function heroLines(draft: Draft | null, max = 60): string[] {
  const byDoc = (draft?.documents ?? [])
    .filter((doc) => doc.state === "read")
    .map((doc) => doc.targets.filter((t) => !t.removed).map((t) => t.text));
  const lines: string[] = [];
  for (let i = 0; lines.length < max && byDoc.some((list) => i < list.length); i++) {
    for (const list of byDoc) {
      if (i < list.length && lines.length < max) lines.push(clip(list[i], 150));
    }
  }
  return lines;
}
