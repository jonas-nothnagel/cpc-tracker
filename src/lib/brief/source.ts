import { normalizeTarget } from "@/lib/normalize-target";
import type { CorpusThemesPayload } from "@/lib/coherence-briefing";
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

  const targets: Target[] = ((data.targets as Record<string, unknown>[]) ?? [])
    .map((t) => normalizeTarget(t, locale))
    .filter((t) => !PSEUDO_DOCUMENTS.has(t.sourceDocument));

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
    .map(({ t }) => ({ id: t.id, doc: t.sourceDocument, label: t.sourceLabel, text: t.text }));
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

  return {
    countryId: args.countryId,
    countryName: args.countryName,
    commitments,
    documents,
    comparisons,
    lenses,
    themes: (data.corpusThemes as CorpusThemesPayload | null) ?? null,
    model: (data.model as string | null) ?? null,
  };
}
