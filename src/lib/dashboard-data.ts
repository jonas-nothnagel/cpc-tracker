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
import { migrateLegacyAlignmentRecords } from "@/lib/alignment-migration";
import { localizeCategories } from "@/data/category-translations";

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
  }>(join(dataDir, "categories.json"));
  const classifications = readJson<unknown[]>(join(outputDir, "classifications.json"));
  const alignmentRaw = readJson<Record<string, unknown>[]>(join(outputDir, "alignment.json"));
  // Migrate any v1 records to v2.1 shape so the rest of the assembly sees a single schema.
  const alignment = alignmentRaw ? migrateLegacyAlignmentRecords(alignmentRaw) : null;
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

  const enrichedTargets = (targets as Record<string, unknown>[]).map((t) => {
    const flags = flagsByTarget.get(String(t.id));
    return {
      ...t,
      isQuantitative: flags?.isQuantitative ?? false,
      isTimeBound: flags?.isTimeBound ?? false,
      quantitativeDetails: flags?.quantitativeDetails ?? undefined,
      timeBoundDetails: flags?.timeBoundDetails ?? undefined,
    };
  });

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
    ? migrateLegacyAlignmentRecords(measureAlignmentRaw)
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
    ? migrateLegacyAlignmentRecords(budgetAlignmentRaw)
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

  const finalClassifications = excludedTargetIds.size
    ? (classifications as Record<string, unknown>[]).filter(
        (c) => !excludedTargetIds.has(String(c.targetId ?? "")),
      )
    : classifications;

  const finalAlignment = excludedTargetIds.size
    ? (allAlignment as Record<string, unknown>[]).filter(
        (a) =>
          !excludedTargetIds.has(String(a.targetAId ?? "")) &&
          !excludedTargetIds.has(String(a.targetBId ?? "")),
      )
    : allAlignment;

  // Scrub excluded entries from the config sent to the frontend.
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

/** A cached country payload: the assembled data plus its serialized + gzipped
 *  forms, so repeat API hits skip disk reads, JSON.stringify, and compression. */
export interface CountryPayload {
  data: DashboardResponse;
  json: string;
  // Typed as Uint8Array (not Buffer) so it satisfies NextResponse's BodyInit;
  // gzipSync returns a Buffer, which is a Uint8Array subclass.
  gzip: Uint8Array;
}

// Keyed by canonical country id. Held for the container's lifetime; a deploy
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
  const result = derivePaths(null, country, model ?? null);
  if (result.kind === "error") {
    return { kind: "error", status: result.status, error: result.error };
  }
  if (result.kind !== "country") {
    return { kind: "error", status: 400, error: "Expected a country param" };
  }

  // Canonical id from the registry (derivePaths already validated it exists).
  // The cache key is per-locale AND per-model: each combination produces a
  // distinct payload (different narratives, different alignment outputs).
  const canonical = getCountry(country.toLowerCase())?.id ?? country.toLowerCase();
  const resolvedModel = result.paths.model;
  const localeKey = locale && locale !== "en" ? `:${locale}` : "";
  const modelKey = resolvedModel ? `@${resolvedModel}` : "";
  const key = `${canonical}${modelKey}${localeKey}`;
  const cached = countryPayloadCache.get(key);
  if (cached) return { kind: "ok", payload: cached };

  const assembled = assembleDashboardData(result.paths, "country", locale);
  if (assembled.kind === "error") {
    return { kind: "error", status: assembled.status, error: assembled.error, missing: assembled.missing };
  }

  const json = JSON.stringify(assembled.data);
  const payload: CountryPayload = { data: assembled.data, json, gzip: gzipSync(json) };
  countryPayloadCache.set(key, payload);
  return { kind: "ok", payload };
}
