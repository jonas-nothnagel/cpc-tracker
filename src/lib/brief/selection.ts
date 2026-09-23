import type { BriefSource, LensId } from "./source";

export type SectionId =
  | "overall"
  | "together"
  | "apart"
  | "commitments"
  | "documents"
  | "map"
  | "areas";

export const SECTION_IDS: SectionId[] = [
  "overall",
  "together",
  "apart",
  "commitments",
  "documents",
  "map",
  "areas",
];

/** The standard brief: three A4 pages. */
export const DEFAULT_SECTIONS: SectionId[] = ["overall", "together", "apart", "documents", "map"];

export interface BriefSelection {
  /** Selected document ids, in config order; always at least two. */
  docs: string[];
  lens: LensId | null;
  /** Sections in reading order. */
  sections: SectionId[];
}

type Params = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function list(value: string | string[] | undefined): string[] | undefined {
  const raw = first(value);
  if (raw === undefined) return undefined;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function allowedSections(source: BriefSource): Set<SectionId> {
  return new Set(SECTION_IDS.filter((id) => id !== "areas" || source.lenses.length > 0));
}

export function defaultSelection(source: BriefSource): BriefSelection {
  const on = source.documents.filter((d) => d.defaultOn).map((d) => d.id);
  const allowed = allowedSections(source);
  return {
    docs: on.length >= 2 ? on : source.documents.map((d) => d.id),
    lens: source.lenses[0]?.id ?? null,
    sections: DEFAULT_SECTIONS.filter((id) => allowed.has(id)),
  };
}

/** Read a selection from URL search params; anything unknown or unusable
 *  falls back to the standard brief, so a hand-edited link never breaks. */
export function parseSelection(params: Params, source: BriefSource): BriefSelection {
  const fallback = defaultSelection(source);

  const wantedDocs = list(params.docs);
  const docs = wantedDocs
    ? source.documents.map((d) => d.id).filter((id) => wantedDocs.includes(id))
    : fallback.docs;

  const wantedLens = first(params.lens);
  const lens =
    source.lenses.find((l) => l.id === wantedLens)?.id ?? fallback.lens;

  const allowed = allowedSections(source);
  const wantedSections = list(params.sections);
  const sections: SectionId[] = [];
  for (const id of wantedSections ?? fallback.sections) {
    if (allowed.has(id as SectionId) && !sections.includes(id as SectionId)) {
      sections.push(id as SectionId);
    }
  }

  return {
    docs: docs.length >= 2 ? docs : fallback.docs,
    lens,
    sections: sections.length > 0 ? sections : fallback.sections,
  };
}

/** Query string for a shareable link; only what differs from the standard brief. */
export function selectionQuery(selection: BriefSelection, source: BriefSource): string {
  const fallback = defaultSelection(source);
  const params = new URLSearchParams();
  if (!sameList(selection.docs, fallback.docs)) params.set("docs", selection.docs.join(","));
  if (selection.lens && selection.lens !== fallback.lens) params.set("lens", selection.lens);
  if (!sameList(selection.sections, fallback.sections)) {
    params.set("sections", selection.sections.join(","));
  }
  return params.toString();
}
