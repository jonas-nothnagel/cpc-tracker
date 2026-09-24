import { normalizeTarget } from "@/lib/normalize-target";
import { loadDocPairSyntheses, type CorpusThemesPayload } from "@/lib/coherence-briefing";
import type {
  AlignmentLevel,
  AlignmentMechanism,
  CountryConfig,
  DocumentTypeEntry,
  Target,
} from "@/types";

/** Reported-measure pseudo-documents never enter the brief. */
const PSEUDO_DOCUMENTS = new Set(["BTR", "BER"]);

/** Longest full document name used in running text before the medium label
 *  takes over (Mongolia's LDN report title runs to 87 characters). */
const MAX_NAME_LENGTH = 60;

export type LensId = "globe" | "ipcc" | "gga" | "hr";

/** Index = code in `BriefSource.comparisons`. */
export const LEVEL_CODES = ["high", "medium", "low", "none", "flagged"] as const;
/** Index = code in `BriefSource.comparisons`; 0 = no mechanism. */
export const MECHANISM_CODES = [
  null,
  "goal_conflict",
  "resource_competition",
  "delivery_friction",
] as const;

export interface BriefCommitment {
  id: string;
  doc: string;
  label: string;
  text: string;
  /** Set when the text shown is not the document's own wording: a machine
   *  translation, or a translation of an original in another language. */
  translated?: "machine" | "translation";
}

export interface BriefDocument {
  id: string;
  /** Short code for tight grids, e.g. "NDC". */
  code: string;
  /** Name for running text: the full name without a trailing parenthetical. */
  name: string;
  full: string;
  color: string;
  /** Commitments this document contributes to the brief. */
  count: number;
  /** In the standard brief (not hidden or secondary in the country config). */
  defaultOn: boolean;
}

export interface BriefLens {
  id: LensId;
  taxonomyType: string;
  categories: { id: string; name: string }[];
  /** Commitment id -> its primary category under this lens. */
  primary: Record<string, string>;
}

/** The pipeline's AI synthesis for one pair of documents (the dashboard's
 *  pair panel): a short title, how they align, where they may diverge, and
 *  a hedged process pointer. */
export interface BriefPairNote {
  a: string;
  b: string;
  title: string;
  align: string;
  diverge: string;
  hint: string;
  /** The AI's own confidence in the reading, kept with feedback on it. */
  confidence?: string;
}

export interface BriefSource {
  countryId: string;
  countryName: string;
  commitments: BriefCommitment[];
  documents: BriefDocument[];
  /** Flat `[a, b, level, mechanism]` per cross-document comparison: `a`/`b`
   *  index `commitments`, `level` indexes LEVEL_CODES, `mechanism` indexes
   *  MECHANISM_CODES. Compact so the whole set can travel to the browser. */
  comparisons: number[];
  lenses: BriefLens[];
  themes: CorpusThemesPayload | null;
  /** AI syntheses per pair of documents; empty when the pipeline wrote none. */
  pairNotes?: BriefPairNote[];
  model: string | null;
}

/** A document's name for running text: its full name without a trailing
 *  parenthetical, or its medium label when the name is still too long. The
 *  medium label's own parenthetical is a category hint ("NDC (Climate)"),
 *  so it is never used on its own as a name. */
export function briefDocName(
  entry: Pick<DocumentTypeEntry, "id" | "mediumLabel" | "fullLabel">,
): string {
  const full = (entry.fullLabel ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (full && full.length <= MAX_NAME_LENGTH) return full;
  return entry.mediumLabel || full || entry.id;
}

/** Whether the text shown for a raw target in this locale is a translation.
 *  Machine back-translations are shown only in their own locale (see
 *  `normalizeTarget`); originals swapped in server-side carry `textLocale`. */
function translationOf(
  raw: Record<string, unknown>,
  locale: string,
): BriefCommitment["translated"] {
  const original = raw.textOriginal;
  if (typeof original !== "string" || !original || original === raw.text) return undefined;
  if (raw.textOriginalSource === "machine") return raw.language === locale ? "machine" : undefined;
  if (raw.textLocale && raw.textLocale === raw.language) return undefined;
  return "translation";
}

const LENS_SPECS: { id: LensId; key: string; taxonomyType: string }[] = [
  { id: "globe", key: "globeCategories", taxonomyType: "globe" },
  { id: "ipcc", key: "sectors", taxonomyType: "sector" },
  { id: "gga", key: "ggaCategories", taxonomyType: "gga" },
  { id: "hr", key: "hrCategories", taxonomyType: "hr" },
];

/**
 * Slim the dashboard payload into what the brief needs in the browser:
 * policy commitments (locale-swapped text), documents in config order,
 * cross-document comparisons in a compact numeric encoding, the policy-area
 * lenses backed by primary classifications, and the recurring themes.
 */
export function buildBriefSource(args: {
  countryId: string;
  countryName: string;
  data: Record<string, unknown>;
  locale: string;
}): BriefSource {
  const { data, locale } = args;
  const config = (data.countryConfig as CountryConfig | null) ?? null;
  const configDocs = config?.documentTypes ?? [];
  const offByDefault = new Set([
    ...(config?.defaultHiddenDocTypes ?? []),
    ...(config?.secondaryDocTypes ?? []),
  ]);

  const raws = ((data.targets as Record<string, unknown>[]) ?? []).filter(
    (t) => !PSEUDO_DOCUMENTS.has(String(t.sourceDocument)),
  );
  const translated = new Map(raws.map((t) => [String(t.id), translationOf(t, locale)]));
  const targets: Target[] = raws.map((t) => normalizeTarget(t, locale));

  const present = new Set(targets.map((t) => t.sourceDocument));
  const docOrder = [
    ...configDocs.map((d) => d.id).filter((id) => present.has(id)),
    ...[...present].filter((id) => !configDocs.some((d) => d.id === id)).sort(),
  ];
  const rank = new Map(docOrder.map((id, i) => [id, i]));

  const commitments: BriefCommitment[] = targets
    .map((t, i) => ({ t, i }))
    .sort(
      (x, y) =>
        (rank.get(x.t.sourceDocument) ?? 0) - (rank.get(y.t.sourceDocument) ?? 0) ||
        x.i - y.i,
    )
    .map(({ t }) => {
      const flag = translated.get(t.id);
      const c: BriefCommitment = { id: t.id, doc: t.sourceDocument, label: t.sourceLabel, text: t.text };
      return flag ? { ...c, translated: flag } : c;
    });
  const indexOf = new Map(commitments.map((c, i) => [c.id, i]));

  const counts = new Map<string, number>();
  for (const c of commitments) counts.set(c.doc, (counts.get(c.doc) ?? 0) + 1);
  const documents: BriefDocument[] = docOrder.map((id) => {
    const entry = configDocs.find((d) => d.id === id);
    return {
      id,
      code: entry?.shortLabel ?? id,
      name: entry ? briefDocName(entry) : id,
      full: entry?.fullLabel ?? id,
      color: entry?.color ?? "#94a3b8",
      count: counts.get(id) ?? 0,
      defaultOn: !offByDefault.has(id),
    };
  });

  const comparisons: number[] = [];
  for (const r of (data.alignment as Record<string, unknown>[]) ?? []) {
    const a = indexOf.get(String(r.targetAId));
    const b = indexOf.get(String(r.targetBId));
    if (a === undefined || b === undefined) continue;
    if (commitments[a].doc === commitments[b].doc) continue;
    const level = LEVEL_CODES.indexOf(r.alignment as AlignmentLevel);
    if (level < 0) continue;
    const mechanism = Math.max(
      0,
      MECHANISM_CODES.indexOf((r.mechanism as AlignmentMechanism | undefined) ?? null),
    );
    comparisons.push(a, b, level, mechanism);
  }

  const classifications =
    (data.classifications as {
      targetId: string;
      categoryId: string;
      taxonomyType: string;
      isPrimary?: boolean;
    }[]) ?? [];
  const lenses: BriefLens[] = [];
  for (const spec of LENS_SPECS) {
    const categories = ((data[spec.key] as { id: string; name: string }[]) ?? []).map(
      (c) => ({ id: String(c.id), name: String(c.name) }),
    );
    if (categories.length === 0) continue;
    const known = new Set(categories.map((c) => c.id));
    const primary: Record<string, string> = {};
    for (const c of classifications) {
      if (!c.isPrimary || c.taxonomyType !== spec.taxonomyType) continue;
      if (!indexOf.has(c.targetId) || !known.has(c.categoryId)) continue;
      primary[c.targetId] = c.categoryId;
    }
    if (Object.keys(primary).length === 0) continue;
    lenses.push({ id: spec.id, taxonomyType: spec.taxonomyType, categories, primary });
  }

  const pairNotes: BriefPairNote[] = loadDocPairSyntheses(data)
    .filter((p) => p.synthesis_error === null && p.synthesis)
    .map((p) => ({
      a: p.doc_a,
      b: p.doc_b,
      title: p.synthesis.storyline_name,
      align: p.synthesis.reinforce,
      diverge: p.synthesis.clash,
      hint: p.synthesis.coordination_hint,
      confidence: p.synthesis.confidence,
    }));

  return {
    countryId: args.countryId,
    countryName: args.countryName,
    commitments,
    documents,
    comparisons,
    lenses,
    themes: (data.corpusThemes as CorpusThemesPayload | null) ?? null,
    pairNotes,
    model: (data.model as string | null) ?? null,
  };
}
