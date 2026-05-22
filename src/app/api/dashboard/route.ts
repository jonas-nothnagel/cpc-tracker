/**
 * Serves pipeline output for the dashboard.
 *
 * Two addressing modes:
 *   - ?analysisId=xxx (upload flow) → reads python/analyses/{id}/
 *   - ?country=<id>   (pilot flow)  → reads python/data/ + python/output/{id}/
 *
 * Precedence: analysisId wins when both are present. Unknown or malformed
 * country params are rejected with 400 BEFORE any filesystem access — the
 * registry is the security gate against path traversal.
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getCountry, isValidCountryId } from "@/config/countries";

const PROJECT_ROOT = process.cwd();
const PYTHON_OUTPUT = join(PROJECT_ROOT, "python", "output");
const PYTHON_DATA = join(PROJECT_ROOT, "python", "data");
const ANALYSES_DIR = join(PROJECT_ROOT, "python", "analyses");

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function readJson<T>(filePath: string): T | null {
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

type DerivedPaths = {
  dataDir: string;
  outputDir: string;
  targetsFile: string;
  /** ISO3 code (lowercase) for external NR7 data lookups. Null on the upload
   *  flow because analysisId data doesn't have a registry entry. */
  iso3: string | null;
};

type DerivedPathsResult =
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
  return {
    kind: "country",
    paths: {
      dataDir: PYTHON_DATA,
      outputDir: join(PYTHON_OUTPUT, entry.id),
      targetsFile: `${entry.id}-targets.json`,
      iso3: entry.iso3,
    },
  };
}

export async function GET(request: NextRequest) {
  const analysisId = request.nextUrl.searchParams.get("analysisId");
  const country = request.nextUrl.searchParams.get("country");

  const result = derivePaths(analysisId, country);
  if (result.kind === "error") {
    return NextResponse.json(
      { error: result.error },
      { status: result.status, headers: NO_STORE_HEADERS },
    );
  }

  const { dataDir, outputDir, targetsFile, iso3 } = result.paths;

  const targets = readJson<unknown[]>(join(dataDir, targetsFile));
  const categories = readJson<{
    nbs_categories: unknown[];
    ipcc_sectors?: unknown[];
    globe_categories?: unknown[];
    globe_subcategories?: unknown[];
  }>(join(dataDir, "categories.json"));
  const classifications = readJson<unknown[]>(join(outputDir, "classifications.json"));
  const alignment = readJson<unknown[]>(join(outputDir, "alignment.json"));
  const quantFlags = readJson<
    { targetId: string; isQuantitative: boolean; isTimeBound: boolean; quantitativeDetails?: string; timeBoundDetails?: string }[]
  >(
    join(outputDir, "quantitative_flags.json")
  );

  if (!targets || !categories || !classifications || !alignment) {
    return NextResponse.json(
      {
        error:
          result.kind === "analysis"
            ? "Analysis results not yet available. The pipeline may still be running."
            : "Pipeline output not found. Run the pipeline first: cd python && uv run python -m src.run_analysis",
        missing: [
          !targets && "targets",
          !categories && "categories",
          !classifications && "classifications",
          !alignment && "alignment",
        ].filter(Boolean),
      },
      { status: 404, headers: NO_STORE_HEADERS }
    );
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
  const measureAlignment = readJson<unknown[]>(
    join(outputDir, "measure_alignment.json")
  );

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
  const budgetAlignment = readJson<unknown[]>(
    join(outputDir, "budget_alignment.json")
  );
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
  const docPairSynthesis = readJson<unknown[]>(
    join(outputDir, "doc_pair_synthesis.json"),
  );
  const corpusThemes = readJson<Record<string, unknown>>(
    join(outputDir, "corpus_themes.json"),
  );
  const sectorSynthesis = readJson<unknown[]>(
    join(outputDir, "sector_synthesis.json"),
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

  return NextResponse.json(
    {
      targets: finalTargets,
      nbsCategories: categories.nbs_categories,
      sectors: categories.ipcc_sectors ?? [],
      globeCategories: categories.globe_categories ?? [],
      globeSubcategories: categories.globe_subcategories ?? [],
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
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
