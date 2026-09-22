/**
 * Shared dashboard data assembly.
 *
 * Reads the pipeline output for a country (or an upload analysis) from disk,
 * migrates/merges/scrubs it, and returns the exact object the dashboard
 * frontend consumes. Extracted from the `/api/dashboard` route so it can be
 * called server-side from the dashboard page (no client round trip) and from
 * the API route, and so country payloads can be cached + pre-gzipped.
 *
 * Addressing modes:
 *   - analysis (?analysisId=xxx) → python/analyses/{id}/   — never cached (may be mid-run)
 *   - country  (?country=<id>)  → python/data/ + python/output/{id}/ — cached for container lifetime
 *
 * The demo-country data only changes on deploy (start.sh re-syncs from the
 * image bundle at container start), so an in-memory cache keyed by country id
 * and held for the container's lifetime is correct.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { gzipSync } from "node:zlib";
import { getCountry, isValidCountryId } from "@/config/countries";
import { routing } from "@/i18n/routing";
import { WHEEL_DRAWN_LEVELS } from "@/types";
import { migrateLegacyAlignmentRecords } from "@/lib/alignment-migration";
import { localizeCategories } from "@/data/category-translations";
import {
  applyAlignmentTranslations,
  localizeLabelled,
  localizeTargetTexts,
  type AlignmentTranslationOverlay,
  type LocalizableTarget,
} from "@/lib/locale-text";
import {
  applyUnclassifiedBuckets,
} from "@/lib/unclassified-bucket";
import type {
  AlignmentLevel,
  BlindEvaluationReport,
  BlindPairSample,
  ModelAgreementSummary,
  ModelComparisonReport,
  ModelDisagreementRow,
  PairRating,
  PairRatingValue,
  RatingsByCountry,
} from "@/types";

const PROJECT_ROOT = process.cwd();
const PYTHON_OUTPUT = join(PROJECT_ROOT, "python", "output");
const PYTHON_DATA = join(PROJECT_ROOT, "python", "data");
const ANALYSES_DIR = join(PROJECT_ROOT, "python", "analyses");

/** Path-traversal guard for model query params. Mirrors python/src/run_analysis.py
 *  slugify_model: lowercase, hyphens, digits, ASCII letters only. */
const MODEL_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function isValidModelSlug(slug: string): boolean {
  return MODEL_SLUG_RE.test(slug);
}

/** Slugs we treat as the "production / flagship" model when a country has
 *  multiple runs and the caller didn't pick one. Order matters: first match
 *  wins. Keeps reviewers landing on the production result, not on an
 *  alphabetically-first comparison run. */
const PREFERRED_DEFAULT_SLUGS = ["gpt-5-4", "gpt-5-5"];

/** List per-model output subdirs that exist for a country, e.g. ['gpt-5-4',
 *  'gpt-5-4-mini']. Returns [] when the country dir is flat (single-model
 *  legacy layout) — callers should treat that as "no model selector".
 *  Sorted with the flagship-default slug first when present, then
 *  alphabetical for the rest, so a no-?model= request lands on the
 *  production model rather than whichever slug sorts first lexically. */
export function listAvailableModels(country: string): string[] {
  const countryDir = join(PYTHON_OUTPUT, country.toLowerCase());
  if (!existsSync(countryDir)) return [];
  try {
    const found = readdirSync(countryDir)
      .filter((name) => MODEL_SLUG_RE.test(name))
      .filter((name) => {
        const sub = join(countryDir, name);
        try {
          return statSync(sub).isDirectory() && existsSync(join(sub, "alignment.json"));
        } catch {
          return false;
        }
      })
      .sort();
    // Promote the first preferred default that exists to position 0.
    const preferred = PREFERRED_DEFAULT_SLUGS.find((slug) => found.includes(slug));
    if (preferred) {
      return [preferred, ...found.filter((s) => s !== preferred)];
    }
    return found;
  } catch {
    return [];
  }
}

export function readJson<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Cross-model comparison artifact, produced by
 *  `python -m src.analyze_model_comparison --country <id>`. Returns null
 *  when the artifact hasn't been generated yet (e.g. a fresh country with
 *  only one model run); callers should treat that as "no analysis to show". */
const modelComparisonCache = new Map<string, ModelComparisonReport | null>();
export function loadModelComparison(country: string): ModelComparisonReport | null {
  const id = country.toLowerCase();
  // In dev, skip the cache so analyzer reruns are visible on next request.
  // Prod (container lifetime cache) keeps the original optimization.
  if (process.env.NODE_ENV !== "development" && modelComparisonCache.has(id)) {
    return modelComparisonCache.get(id) ?? null;
  }
  const report = readJson<ModelComparisonReport>(
    join(PYTHON_OUTPUT, id, "_model_comparison.json"),
  );
  modelComparisonCache.set(id, report);
  return report;
}

/** Full per-model verdict maps ("A::B" → alignment level) from each model's
 *  alignment.json. Server-side only: feeds computeModelAgreement so the
 *  blind evaluation page can show aggregate agreement without any per-pair
 *  verdict entering the client payload. Missing/broken files yield an empty
 *  map for that model. */
export function loadModelAlignmentLabels(
  country: string,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const model of listAvailableModels(country)) {
    out[model] = {};
    try {
      const raw = readFileSync(
        join(PYTHON_OUTPUT, country.toLowerCase(), model, "alignment.json"),
        "utf-8",
      );
      const rows = JSON.parse(raw) as {
        targetAId?: string;
        targetBId?: string;
        alignment?: string;
      }[];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (
          typeof row.targetAId === "string" &&
          typeof row.targetBId === "string" &&
          typeof row.alignment === "string"
        ) {
          out[model][`${row.targetAId}::${row.targetBId}`] = row.alignment;
        }
      }
    } catch {
      // Leave the model's map empty; the page shows "—" for that model.
    }
  }
  return out;
}

/** Aggregate agreement between the reviewer's blind ratings and each
 *  model's stored verdicts. Pure and order-insensitive on pair keys;
 *  exported for tests. Only these aggregates leave the server. */
export function computeModelAgreement(
  labelsByModel: Record<string, Record<string, string>>,
  ratings: RatingsByCountry,
): ModelAgreementSummary[] {
  return Object.entries(labelsByModel).map(([slug, labels]) => {
    let n = 0;
    let exactMatches = 0;
    let flagMatches = 0;
    for (const [pairKey, rating] of Object.entries(ratings)) {
      const [a, b] = pairKey.split("::");
      const level = labels[pairKey] ?? (a && b ? labels[`${b}::${a}`] : undefined);
      if (level == null) continue;
      n++;
      if (level === rating.rating) exactMatches++;
      if ((level === "flagged") === (rating.rating === "flagged")) flagMatches++;
    }
    return { slug, n, exactMatches, flagMatches };
  });
}

/** Strip a comparison report down to what the blind evaluation page may
 *  see: pair IDs and target text only — no model labels, rationales, or
 *  flag details, and none of the analyst-view row sets. Runs server-side
 *  so the verdicts never enter the client payload; the DOM staying blind
 *  is not enough when view-source would unblind the reviewer. */
export function sanitizeForBlindEvaluation(
  report: ModelComparisonReport,
): BlindEvaluationReport {
  const strip = (rows: ModelDisagreementRow[] | undefined): BlindPairSample[] =>
    (rows ?? []).map(({ targetAId, targetBId }) => ({ targetAId, targetBId }));
  const uniqueSignalRandomSample: Record<string, BlindPairSample[]> = {};
  for (const slug of report.models) {
    uniqueSignalRandomSample[slug] = strip(
      report.uniqueSignalRandomSample?.[slug],
    );
  }
  return {
    country: report.country,
    models: report.models,
    targets: report.targets,
    uniqueSignalRandomSample,
    consensusFlaggedRandomSample: strip(report.consensusFlaggedRandomSample),
  };
}

/** Human ratings on individual flagged pairs. Streams the append-only
 *  ledger at `python/output/ratings-ledger.jsonl` and folds events to
 *  `{ pairKey → latest rating for this country }`. Intentionally NOT
 *  cached: reviewer writes flip the file at runtime, so each page render
 *  re-reads. Fold is O(events) — fast enough for anything short of
 *  hundreds of thousands of ratings. */
// Current scheme only: legacy "real" | "thin" | "skip" events fail this
// check and fold to "unrated", so reviewers re-rate those pairs on the
// alignment scale. The legacy events stay in the ledger for calibration.
const RATING_VALUES: ReadonlySet<PairRatingValue> = new Set([
  "none",
  "low",
  "medium",
  "high",
  "flagged",
]);

/**
 * Per-model flagged pair keys from each model's full alignment output
 * ("A::B", row order as generated). Lets the evaluation page attribute
 * ledger ratings to models: a rating counts "for" a model when that model
 * currently flags the pair — stable across comparison re-runs, unlike the
 * re-drawn samples. Missing/broken files yield an empty list for that model.
 */
export function loadModelFlaggedPairKeys(
  country: string,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const model of listAvailableModels(country)) {
    out[model] = [];
    try {
      const raw = readFileSync(
        join(PYTHON_OUTPUT, country.toLowerCase(), model, "alignment.json"),
        "utf-8",
      );
      const rows = JSON.parse(raw) as {
        targetAId?: string;
        targetBId?: string;
        alignment?: string;
      }[];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (
          row.alignment === "flagged" &&
          typeof row.targetAId === "string" &&
          typeof row.targetBId === "string"
        ) {
          out[model].push(`${row.targetAId}::${row.targetBId}`);
        }
      }
    } catch {
      // Leave the model's list empty; the page degrades to sample-only counts.
    }
  }
  return out;
}

export function loadRatings(country: string): RatingsByCountry {
  const path = join(PYTHON_OUTPUT, "ratings-ledger.jsonl");
  if (!existsSync(path)) return {};
  const id = country.toLowerCase();
  const out: RatingsByCountry = {};
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return {};
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let evt: unknown;
    try {
      evt = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!evt || typeof evt !== "object") continue;
    const e = evt as Record<string, unknown>;
    if (typeof e.country !== "string" || e.country.toLowerCase() !== id) continue;
    if (typeof e.pairKey !== "string") continue;
    if (typeof e.rating !== "string" || !RATING_VALUES.has(e.rating as PairRatingValue)) continue;
    const ts = typeof e.ts === "number" && Number.isFinite(e.ts) ? e.ts : 0;
    const previous = out[e.pairKey];
    if (previous && previous.ts >= ts) continue;
    const rating: PairRating = {
      rating: e.rating as PairRatingValue,
      note: typeof e.note === "string" ? e.note : "",
      ts,
    };
    out[e.pairKey] = rating;
  }
  return out;
}

/**
 * Derive a country-specific data filename from the targets filename.
 * mongolia-targets.json → mongolia-btr-adaptation.json (suffix "btr-adaptation")
 * targets.json         → btr-adaptation.json (upload wizard path, no prefix)
 */
function deriveCountryFile(targetsFile: string, suffix: string): string {
  const prefix = targetsFile.replace(/-?targets\.json$/, "");
  return prefix ? `${prefix}-${suffix}.json` : `${suffix}.json`;
}

export type DerivedPaths = {
  dataDir: string;
  outputDir: string;
  targetsFile: string;
  /** ISO3 code (lowercase) for external NR7 data lookups. Null on the upload
   *  flow because analysisId data doesn't have a registry entry. */
  iso3: string | null;
  /** The model slug that resolved this path, when ?model= was passed. Null
   *  for upload flow and for country requests with no per-model subdirs. */
  model: string | null;
};

export type DerivedPathsResult =
  | { kind: "analysis"; analysisBase: string; paths: DerivedPaths }
  | { kind: "country"; paths: DerivedPaths }
  | { kind: "error"; status: 400 | 404; error: string };

/**
 * Pure path-derivation helper. Decides which addressing mode applies, runs the
 * security gate for country ids, and returns the resolved paths OR an error
 * shape the caller should return directly.
 *
 * Callers pass raw query-string values; this helper handles lowercase,
 * empty-string-as-missing, format validation, and registry lookup.
 */
export function derivePaths(
  rawAnalysisId: string | null,
  rawCountry: string | null,
  rawModel: string | null = null,
): DerivedPathsResult {
  // analysisId wins when both are present. Keep the existing analysisId
  // validation shape (regex + existsSync fall-through handled by the caller).
  if (rawAnalysisId) {
    if (!/^[a-f0-9-]{4,36}$/.test(rawAnalysisId)) {
      return { kind: "error", status: 400, error: "Invalid analysis ID" };
    }
    const analysisBase = join(ANALYSES_DIR, rawAnalysisId);
    if (!existsSync(analysisBase)) {
      return { kind: "error", status: 404, error: "Analysis not found" };
    }
    return {
      kind: "analysis",
      analysisBase,
      paths: {
        dataDir: join(analysisBase, "input"),
        outputDir: join(analysisBase, "output"),
        targetsFile: "targets.json",
        iso3: null,
        model: null,
      },
    };
  }

  // Country-addressed path. Empty string is treated as missing.
  const countryLower = rawCountry?.toLowerCase() ?? null;
  if (!countryLower) {
    return { kind: "error", status: 400, error: "Missing country param" };
  }
  if (!isValidCountryId(countryLower)) {
    return { kind: "error", status: 400, error: "Invalid country format" };
  }
  const entry = getCountry(countryLower);
  if (!entry) {
    return { kind: "error", status: 400, error: "Country not in registry" };
  }

  // Per-model output subdir resolution. The model slug must match the strict
  // format guard (no path traversal). If the country has any per-model subdirs
  // and the caller didn't request one, default to the first available so the
  // initial dashboard load still finds outputs after the migration to the
  // {country}/{model}/ layout.
  const countryDir = join(PYTHON_OUTPUT, entry.id);
  let resolvedModel: string | null = null;
  if (rawModel) {
    if (!isValidModelSlug(rawModel)) {
      return { kind: "error", status: 400, error: "Invalid model format" };
    }
    const modelDir = join(countryDir, rawModel);
    if (!existsSync(modelDir)) {
      return { kind: "error", status: 404, error: "Model output not found for country" };
    }
    resolvedModel = rawModel;
  } else {
    const available = listAvailableModels(entry.id);
    if (available.length > 0) resolvedModel = available[0];
  }
  const outputDir = resolvedModel ? join(countryDir, resolvedModel) : countryDir;

  return {
    kind: "country",
    paths: {
      dataDir: PYTHON_DATA,
      outputDir,
      targetsFile: `${entry.id}-targets.json`,
      iso3: entry.iso3,
      model: resolvedModel,
    },
  };
}

/** The exact payload shape the dashboard frontend consumes. Fields are loosely
 *  typed (mirroring the readJson generics) because normalization happens on the
 *  client; the contract is "same keys, same values as before". */
export interface DashboardResponse {
  targets: unknown[];
  nbsCategories: unknown[];
  sectors: unknown[];
  globeCategories: unknown[];
  globeSubcategories: unknown[];
  ggaCategories: unknown[];
  hrCategories: unknown[];
  classifications: unknown[];
  alignment: unknown[];
  btrData: Record<string, unknown> | null;
  nr7Data: unknown;
  berData: unknown;
  budgetAlignment: unknown[] | null;
  budgetPseudoTargets: Record<string, unknown>[] | null;
  footprint: Record<string, unknown> | null;
  docPairSynthesis: unknown[];
  corpusThemes: Record<string, unknown> | null;
  /** Legacy bare array OR the new { synthesis, states } object. */
  sectorSynthesis: unknown;
  countryConfig: Record<string, unknown> | null;
  /** The model slug whose outputs assembled this payload, when the country
   *  has per-model subdirs. Null when the country has no per-model layout. */
  model: string | null;
  /** All model slugs available for this country. Empty when the country has
   *  no per-model layout. Drives the model selector. */
  availableModels: string[];
}

export type AssembleResult =
  | { kind: "ok"; data: DashboardResponse }
  | { kind: "error"; status: 404; error: string; missing: string[] };

/**
 * Read + assemble the dashboard payload for resolved paths. Pure (filesystem
 * reads only). `kind` only affects the 404 message wording. The returned data
 * object is byte-identical to the legacy `/api/dashboard` response body.
 */
/** Read a per-locale variant of an output file when present, else the base
 *  (English) file. Used for the AI-narrative synthesis files, which carry a
 *  machine-translated `<name>.<locale>.json` snapshot alongside the English
 *  original. Any other locale, or a missing variant, falls back to English. */
function readLocalizedJson<T>(
  outputDir: string,
  name: string,
  locale?: string,
): T | null {
  if (locale && locale !== "en") {
    const variant = readJson<T>(
      join(outputDir, name.replace(/\.json$/, `.${locale}.json`)),
    );
    if (variant) return variant;
  }
  return readJson<T>(join(outputDir, name));
}

export function assembleDashboardData(
  paths: DerivedPaths,
  kind: "country" | "analysis",
  locale?: string,
): AssembleResult {
  const { dataDir, outputDir, targetsFile, iso3, model } = paths;
  // Country-level model registry, surfaced in the payload so the frontend
  // can render the selector without an extra round trip. Upload flow has no
  // per-model layout, so this is empty there. The country id is derived from
  // the targets filename (e.g. mongolia-targets.json → mongolia) so we don't
  // have to parse `outputDir` to figure out whether a model subdir is in play.
  const countryIdMatch = kind === "country"
    ? targetsFile.match(/^(.+)-targets\.json$/)
    : null;
  const availableModels = countryIdMatch
    ? listAvailableModels(countryIdMatch[1])
    : [];

  const targets = readJson<unknown[]>(join(dataDir, targetsFile));
  const categories = readJson<{
    nbs_categories: unknown[];
    ipcc_sectors?: unknown[];
    globe_categories?: unknown[];
    globe_subcategories?: unknown[];
    gga_categories?: unknown[];
    hr_categories?: unknown[];
  }>(join(dataDir, "categories.json"));
  const classifications = readJson<unknown[]>(join(outputDir, "classifications.json"));
  // Read the sparse per-locale rationale overlay for one alignment file.
  // Deliberately NOT readLocalizedJson: that swaps a whole file, and these are
  // maps merged onto the English records. See src/lib/locale-text.
  const rationaleOverlay = (name: string) =>
    locale && locale !== "en"
      ? readJson<AlignmentTranslationOverlay>(
          join(outputDir, name.replace(/\.json$/, `.${locale}.json`)),
        )
      : null;

  const alignmentRaw = readJson<Record<string, unknown>[]>(join(outputDir, "alignment.json"));
  // Migrate any v1 records to v2.1 shape so the rest of the assembly sees a single schema.
  const alignmentMigrated = alignmentRaw ? migrateLegacyAlignmentRecords(alignmentRaw) : null;
  // Overlay the per-locale pair rationales where a translation pass has run.
  // Deliberately NOT readLocalizedJson: that swaps a whole file, and this one is
  // a sparse map merged onto the English records. See src/lib/locale-text.
  const alignment = alignmentMigrated
    ? applyAlignmentTranslations(
        alignmentMigrated,
        rationaleOverlay("alignment.json"),
        locale,
      )
    : null;
  // Which elements each target's text states (action / scope / outcome), from
  // python/src/target_quality.py. Optional by design: when the file is absent
  // every quality affordance hides, exactly as the briefing already treats
  // missing BER / BTR / NR7 data. See .../coherence-briefing/target-quality.
  const targetQuality = readJson<
    {
      targetId: string;
      elements?: Record<string, boolean>;
      evidence?: Record<string, string>;
      confidence?: string;
    }[]
  >(join(outputDir, "target_quality.json"));

  const quantFlags = readJson<
    { targetId: string; isQuantitative: boolean; isTimeBound: boolean; quantitativeDetails?: string; timeBoundDetails?: string }[]
  >(
    join(outputDir, "quantitative_flags.json")
  );

  if (!targets || !categories || !classifications || !alignment) {
    return {
      kind: "error",
      status: 404,
      error:
        kind === "analysis"
          ? "Analysis results not yet available. The pipeline may still be running."
          : "Pipeline output not found. Run the pipeline first: cd python && uv run python -m src.run_analysis",
      missing: [
        !targets && "targets",
        !categories && "categories",
        !classifications && "classifications",
        !alignment && "alignment",
      ].filter(Boolean) as string[],
    };
  }

  const flagsByTarget = new Map<
    string,
    { isQuantitative: boolean; isTimeBound: boolean; quantitativeDetails?: string; timeBoundDetails?: string }
  >();
  // Normalise details that may be Python list repr: "['foo', 'bar']" → "foo, bar"
  function normaliseDetails(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return trimmed
        .slice(1, -1)
        .split(/,\s*/)
        .map((s) => s.replace(/^['"]|['"]$/g, "").trim())
        .filter(Boolean)
        .join(", ");
    }
    return trimmed || undefined;
  }

  if (quantFlags) {
    for (const f of quantFlags) {
      flagsByTarget.set(f.targetId, {
        isQuantitative: f.isQuantitative,
        isTimeBound: f.isTimeBound,
        quantitativeDetails: normaliseDetails(f.quantitativeDetails),
        timeBoundDetails: normaliseDetails(f.timeBoundDetails),
      });
    }
  }

  // The five elements are assembled here rather than in the pipeline: two of
  // them (measurable / deadline) already existed as quantitative flags, and
  // recomputing them would risk the two sources disagreeing.
  const qualityByTarget = new Map<
    string,
    {
      elements: Record<string, boolean>;
      evidence: Record<string, string>;
      confidence?: string;
    }
  >();
  if (targetQuality) {
    for (const q of targetQuality) {
      const flags = flagsByTarget.get(q.targetId);
      qualityByTarget.set(q.targetId, {
        elements: {
          measurable: flags?.isQuantitative ?? false,
          deadline: flags?.isTimeBound ?? false,
          ...(q.elements ?? {}),
        },
        evidence: {
          measurable: flags?.quantitativeDetails ?? "",
          deadline: flags?.timeBoundDetails ?? "",
          ...(q.evidence ?? {}),
        },
        confidence: q.confidence,
      });
    }
  }

  const enrichedTargets = localizeTargetTexts(
    (targets as (Record<string, unknown> & LocalizableTarget)[]).map((t) => {
      const flags = flagsByTarget.get(String(t.id));
      const quality = qualityByTarget.get(String(t.id));
      return {
        ...t,
        isQuantitative: flags?.isQuantitative ?? false,
        isTimeBound: flags?.isTimeBound ?? false,
        quantitativeDetails: flags?.quantitativeDetails ?? undefined,
        timeBoundDetails: flags?.timeBoundDetails ?? undefined,
        definition: quality,
      };
    }),
    // Show people their own words: in a locale that matches the target's
    // source language, render the original and keep the English analysis text
    // behind the language chip. Safe to do here because the country payload is
    // cached per-locale. See src/lib/locale-text.
    locale,
  );

  const btrData = readJson<{ mitigationMeasures?: Record<string, unknown>[] } & Record<string, unknown>>(
    join(outputDir, "btr_data.json")
  );

  // Merge hand-curated BTR adaptation actions (e.g. Mongolia Table III.9) into
  // btrData.mitigationMeasures so the frontend sees mitigation + adaptation
  // as one list, disambiguated by each row's `actionType` field. The Python
  // pipeline reads the same JSON file independently; this merge exists so the
  // frontend doesn't need a separate API surface for adaptation actions.
  //
  // Filename is derived from the targets file so a second country only needs
  // to drop a `{country}-btr-adaptation.json` alongside `{country}-targets.json`.
  if (btrData) {
    const adaptationFile = readJson<{
      sourceRef?: Record<string, unknown>;
      groupingLabel?: string;
      adaptationGoals?: Array<{ id: string; description: string }>;
      actions?: Record<string, unknown>[];
    }>(join(dataDir, deriveCountryFile(targetsFile, "btr-adaptation")));
    if (adaptationFile?.actions?.length) {
      const adaptationRows = adaptationFile.actions.map((a) => ({
        ...a,
        actionType: "adaptation" as const,
        sourceRef: adaptationFile.sourceRef,
      }));
      btrData.mitigationMeasures = [
        ...(btrData.mitigationMeasures ?? []),
        ...adaptationRows,
      ];
      if (adaptationFile.adaptationGoals) {
        btrData.adaptationGoals = adaptationFile.adaptationGoals;
      }
      if (adaptationFile.groupingLabel) {
        btrData.adaptationGroupingLabel = adaptationFile.groupingLabel;
      }
      if (adaptationFile.sourceRef) {
        btrData.adaptationSourceRef = adaptationFile.sourceRef;
      }
    }
  }

  // Default actionType to "mitigation" on any BTR measure that lacks it.
  // Adaptation rows (set above) already carry their tag; this catches the
  // original mitigationMeasures which don't have the field in the JSON.
  if (btrData?.mitigationMeasures) {
    for (const m of btrData.mitigationMeasures) {
      if (!m.actionType) m.actionType = "mitigation";
    }
  }

  // Country-specific provenance and display config (e.g. doc citation strings
  // for the Data Sources chips). Optional; falls back to empty object when
  // absent, so the frontend can show a chip without a provenance tooltip.
  const countryConfig = readJson<Record<string, unknown>>(
    join(dataDir, deriveCountryFile(targetsFile, "country-config"))
  );

  // Load NR7 progress data if the country has an iso3 (pilot flow only — the
  // upload flow has no registry entry and doesn't load NR7).
  const externalDir = join(PROJECT_ROOT, "python", "data", "external");
  let nr7Data = null;
  if (iso3) {
    const nr7Path = join(externalDir, `nr7_${iso3}.json`);
    nr7Data = readJson<unknown>(nr7Path);
  }

  // Merge measure pseudo-targets and alignment if available
  const measurePseudoTargets = readJson<Record<string, unknown>[]>(
    join(outputDir, "measure_pseudo_targets.json")
  );
  const measureAlignmentRaw = readJson<Record<string, unknown>[]>(
    join(outputDir, "measure_alignment.json")
  );
  const measureAlignment = measureAlignmentRaw
    ? applyAlignmentTranslations(
        migrateLegacyAlignmentRecords(measureAlignmentRaw),
        rationaleOverlay("measure_alignment.json"),
        locale,
      )
    : null;

  const allTargets = measurePseudoTargets
    ? [...enrichedTargets, ...measurePseudoTargets]
    : enrichedTargets;

  const allAlignment = measureAlignment
    ? [...(alignment as unknown[]), ...measureAlignment]
    : alignment;

  // Budget alignment (BER data)
  const budgetPseudoTargets = readJson<Record<string, unknown>[]>(
    join(outputDir, "budget_pseudo_targets.json")
  );
  const budgetAlignmentRaw = readJson<Record<string, unknown>[]>(
    join(outputDir, "budget_alignment.json")
  );
  const budgetAlignment = budgetAlignmentRaw
    ? applyAlignmentTranslations(
        migrateLegacyAlignmentRecords(budgetAlignmentRaw),
        rationaleOverlay("budget_alignment.json"),
        locale,
      )
    : null;
  const berData = readJson<unknown>(
    join(dataDir, deriveCountryFile(targetsFile, "ber"))
  );

  // Load environmental footprint snapshot if available
  const footprint = readJson<Record<string, unknown>>(
    join(outputDir, "footprint.json")
  );

  // Synthesis layer (post-processing of alignment + classifications). Three
  // files per country; each may be absent on older runs. Frontend degrades
  // gracefully via empty defaults.
  const docPairSynthesis = readLocalizedJson<unknown[]>(
    outputDir,
    "doc_pair_synthesis.json",
    locale,
  );
  // corpus_themes.json and sector_synthesis.json carry a `states` map keyed by
  // the canonical hidden-doc set (for the document include/exclude toggle).
  // Pass them through raw — the briefing selects the matching state client-side.
  // sector_synthesis may be the new { synthesis, states } object or a legacy
  // bare array; the client selector handles both.
  const corpusThemes = readLocalizedJson<Record<string, unknown>>(
    outputDir,
    "corpus_themes.json",
    locale,
  );
  const sectorSynthesis = readLocalizedJson<unknown>(
    outputDir,
    "sector_synthesis.json",
    locale,
  );

  // Strip excluded document types so they never reach the frontend.
  const excluded = new Set<string>(
    (countryConfig as { excludedDocTypes?: string[] } | null)?.excludedDocTypes ?? [],
  );

  const finalTargets = excluded.size
    ? (allTargets as Record<string, unknown>[]).filter(
        (t) => !excluded.has(String(t.sourceDocument ?? "")),
      )
    : allTargets;

  const excludedTargetIds = excluded.size
    ? new Set(
        (allTargets as Record<string, unknown>[])
          .filter((t) => excluded.has(String(t.sourceDocument ?? "")))
          .map((t) => String(t.id)),
      )
    : new Set<string>();

  const visibleClassifications = excludedTargetIds.size
    ? (classifications as Record<string, unknown>[]).filter(
        (c) => !excludedTargetIds.has(String(c.targetId ?? "")),
      )
    : classifications;

  // Mark targets with no relevant category with a derived "no clear theme"
  // primary rather than letting a sub-threshold primary read as a real one.
  // The marker is never listed as a category: lens surfaces exclude the marked
  // targets and state the lens scope. Derived here, never in categories.json;
  // see `lib/unclassified-bucket.ts` for why.
  const { classifications: finalClassifications } =
    applyUnclassifiedBuckets(
      (visibleClassifications ?? []) as Record<string, unknown>[],
    );

  const finalAlignment = excludedTargetIds.size
    ? (allAlignment as Record<string, unknown>[]).filter(
        (a) =>
          !excludedTargetIds.has(String(a.targetAId ?? "")) &&
          !excludedTargetIds.has(String(a.targetBId ?? "")),
      )
    : allAlignment;

  // Scrub excluded entries from the config sent to the frontend.
  // Fold per-locale document label overrides in before the exclusion filter, so
  // both steps hand on one already-localized documentTypes list and no call
  // site downstream needs to know a locale exists. See src/lib/locale-text.
  if (countryConfig) {
    const cfg = countryConfig as Record<string, unknown>;
    const docTypes = cfg.documentTypes as
      | Record<string, unknown>[]
      | undefined;
    if (docTypes) {
      const localized = localizeLabelled(docTypes, locale);
      if (localized !== docTypes) cfg.documentTypes = localized;
    }
  }

  let finalConfig = countryConfig;
  if (excluded.size && countryConfig) {
    const cfg = countryConfig as Record<string, unknown>;
    const docTypes = cfg.documentTypes as { id: string }[] | undefined;
    const provenance = cfg.docProvenance as Record<string, string> | undefined;
    finalConfig = {
      ...cfg,
      ...(docTypes
        ? { documentTypes: docTypes.filter((d) => !excluded.has(d.id)) }
        : {}),
      ...(provenance
        ? {
            docProvenance: Object.fromEntries(
              Object.entries(provenance).filter(([k]) => !excluded.has(k)),
            ),
          }
        : {}),
    };
  }

  return {
    kind: "ok",
    data: {
      targets: finalTargets,
      // Category display names are localized here (es/mn) by id; English is the
      // fallback. The source-traced `categories.json` is never mutated — this
      // only swaps the display `name`, so every render site (wheel, atlas,
      // sector rows, drawer, GGA lens, financing) shows the localized label.
      // Safe to do here because the country payload is cached per-locale.
      nbsCategories: localizeCategories(
        categories.nbs_categories as Record<string, unknown>[] | null,
        locale,
      ),
      sectors: localizeCategories(
        (categories.ipcc_sectors ?? []) as Record<string, unknown>[],
        locale,
      ),
      globeCategories: localizeCategories(
        (categories.globe_categories ?? []) as Record<string, unknown>[],
        locale,
      ),
      globeSubcategories: categories.globe_subcategories ?? [],
      ggaCategories: localizeCategories(
        (categories.gga_categories ?? []) as Record<string, unknown>[],
        locale,
      ),
      hrCategories: localizeCategories(
        (categories.hr_categories ?? []) as Record<string, unknown>[],
        locale,
      ),
      classifications: finalClassifications,
      alignment: finalAlignment,
      btrData: btrData ?? null,
      nr7Data: nr7Data ?? null,
      berData: berData ?? null,
      budgetAlignment: budgetAlignment ?? null,
      budgetPseudoTargets: budgetPseudoTargets ?? null,
      footprint: footprint ?? null,
      docPairSynthesis: docPairSynthesis ?? [],
      corpusThemes: corpusThemes ?? null,
      sectorSynthesis: sectorSynthesis ?? [],
      countryConfig: finalConfig ?? null,
      model,
      availableModels,
    },
  };
}

/**
 * The slice of a country payload the landing wheel needs: enough to draw one
 * wheel grouped by document. The wheel variant of `Centerpiece` reads only
 * `id` and `sourceDocument` from a target, only the pair ids and level from an
 * alignment, and never draws a pair outside `WHEEL_DRAWN_LEVELS` (the
 * constellation variant does draw `low`, so it must not be fed this slice).
 * Serving this instead of the full payload takes the landing's per-country
 * download from megabytes to a few hundred KB.
 */
export interface WheelSliceResponse {
  targets: { id: string; sourceDocument: string }[];
  alignment: { targetAId: string; targetBId: string; alignment: string }[];
  countryConfig: Record<string, unknown> | null;
}

export function projectWheelSlice(
  data: Pick<DashboardResponse, "targets" | "alignment" | "countryConfig">,
): WheelSliceResponse {
  const targets: WheelSliceResponse["targets"] = [];
  for (const raw of data.targets) {
    const t = raw as { id?: unknown; sourceDocument?: unknown };
    if (typeof t.id === "string" && typeof t.sourceDocument === "string") {
      targets.push({ id: t.id, sourceDocument: t.sourceDocument });
    }
  }
  const alignment: WheelSliceResponse["alignment"] = [];
  for (const raw of data.alignment) {
    const a = raw as { targetAId?: unknown; targetBId?: unknown; alignment?: unknown };
    if (
      typeof a.targetAId === "string" &&
      typeof a.targetBId === "string" &&
      typeof a.alignment === "string" &&
      WHEEL_DRAWN_LEVELS.has(a.alignment as AlignmentLevel)
    ) {
      alignment.push({ targetAId: a.targetAId, targetBId: a.targetBId, alignment: a.alignment });
    }
  }
  return { targets, alignment, countryConfig: data.countryConfig ?? null };
}

/** A serialized payload plus its gzipped form, so repeat API hits skip
 *  JSON.stringify and compression. */
export interface SerializedPayload {
  json: string;
  // Typed as Uint8Array (not Buffer) so it satisfies NextResponse's BodyInit;
  // gzipSync returns a Buffer, which is a Uint8Array subclass.
  gzip: Uint8Array;
}

/** A cached country payload: the assembled data plus its serialized forms. */
export interface CountryPayload extends SerializedPayload {
  data: DashboardResponse;
}

function serializePayload(value: unknown): SerializedPayload {
  const json = JSON.stringify(value);
  return { json, gzip: gzipSync(json) };
}

/**
 * Locale as it participates in cache keys and assembly. Anything outside the
 * routing table falls back to English, so an arbitrary `?locale=` value can
 * neither create its own container-lifetime cache entry nor change what is
 * assembled (assembly already reads English for unknown locales).
 */
function normalizeLocale(locale: string | undefined): string | undefined {
  if (!locale || locale === routing.defaultLocale) return undefined;
  return (routing.locales as readonly string[]).includes(locale) ? locale : undefined;
}

type CountryCacheKeyResult =
  | { kind: "ok"; key: string; paths: DerivedPaths; locale: string | undefined }
  | { kind: "error"; status: 400 | 404; error: string };

/**
 * Validate a country request (registry, model slug, paths) and derive the key
 * every per-country cache shares: canonical id, then `@model` when a per-model
 * subdir resolved, then `:locale` for non-English locales. Each combination
 * produces a distinct payload (different narratives, different alignment
 * outputs), so each gets its own entry.
 */
function resolveCountryCacheKey(
  country: string,
  locale: string | undefined,
  model: string | null | undefined,
): CountryCacheKeyResult {
  const result = derivePaths(null, country, model ?? null);
  if (result.kind === "error") {
    return { kind: "error", status: result.status, error: result.error };
  }
  if (result.kind !== "country") {
    return { kind: "error", status: 400, error: "Expected a country param" };
  }
  // Canonical id from the registry (derivePaths already validated it exists).
  const canonical = getCountry(country.toLowerCase())?.id ?? country.toLowerCase();
  const normalizedLocale = normalizeLocale(locale);
  const modelKey = result.paths.model ? `@${result.paths.model}` : "";
  const localeKey = normalizedLocale ? `:${normalizedLocale}` : "";
  return {
    kind: "ok",
    key: `${canonical}${modelKey}${localeKey}`,
    paths: result.paths,
    locale: normalizedLocale,
  };
}

// Keyed by resolveCountryCacheKey. Held for the container's lifetime; a deploy
// restarts the container (fresh image, fresh map). Never holds analysis payloads.
const countryPayloadCache = new Map<string, CountryPayload>();

export type CountryPayloadResult =
  | { kind: "ok"; payload: CountryPayload }
  | { kind: "error"; status: 400 | 404; error: string; missing?: string[] };

/**
 * Resolve, assemble, serialize, and gzip a country's dashboard payload, caching
 * the result for the container's lifetime. Used by both the API route (serves
 * the gzip buffer) and the dashboard page (server-renders from `.data`).
 */
export function getCountryDashboardPayload(
  country: string,
  locale?: string,
  model?: string | null,
): CountryPayloadResult {
  const resolved = resolveCountryCacheKey(country, locale, model);
  if (resolved.kind === "error") return resolved;
  const cached = countryPayloadCache.get(resolved.key);
  if (cached) return { kind: "ok", payload: cached };

  const assembled = assembleDashboardData(resolved.paths, "country", resolved.locale);
  if (assembled.kind === "error") {
    return { kind: "error", status: assembled.status, error: assembled.error, missing: assembled.missing };
  }

  const payload: CountryPayload = { data: assembled.data, ...serializePayload(assembled.data) };
  countryPayloadCache.set(resolved.key, payload);
  return { kind: "ok", payload };
}

export type WheelPayloadResult =
  | { kind: "ok"; payload: SerializedPayload }
  | { kind: "error"; status: 400 | 404; error: string; missing?: string[] };

// Slim entries only (tens to hundreds of KB each), in the same key space as
// the full-payload cache.
const wheelPayloadCache = new Map<string, SerializedPayload>();

/**
 * The landing wheel's slice of a country payload, validated and keyed exactly
 * like the full payload (so `?model=` and `?locale=` behave the same on both
 * routes) and cached in its own serialized form. When the full payload is
 * already cached the slice is projected from it; otherwise the data is
 * assembled once and only the slim slice is retained, so the landing's idle
 * prefetch of every pilot does not pin every full payload in memory.
 */
export function getCountryWheelPayload(
  country: string,
  locale?: string,
  model?: string | null,
): WheelPayloadResult {
  const resolved = resolveCountryCacheKey(country, locale, model);
  if (resolved.kind === "error") return resolved;
  const cached = wheelPayloadCache.get(resolved.key);
  if (cached) return { kind: "ok", payload: cached };

  let data = countryPayloadCache.get(resolved.key)?.data;
  if (!data) {
    const assembled = assembleDashboardData(resolved.paths, "country", resolved.locale);
    if (assembled.kind === "error") {
      return { kind: "error", status: assembled.status, error: assembled.error, missing: assembled.missing };
    }
    data = assembled.data;
  }
  const payload = serializePayload(projectWheelSlice(data));
  wheelPayloadCache.set(resolved.key, payload);
  return { kind: "ok", payload };
}
