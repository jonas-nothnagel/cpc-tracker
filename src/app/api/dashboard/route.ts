/**
 * Serves pipeline output for the dashboard.
 *
 * - Default: reads from python/output/ and python/data/ (Mongolia pilot)
 * - With ?analysisId=xxx: reads from python/analyses/{id}/
 */

import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = process.cwd();
const PYTHON_OUTPUT = join(PROJECT_ROOT, "python", "output");
const PYTHON_DATA = join(PROJECT_ROOT, "python", "data");
const ANALYSES_DIR = join(PROJECT_ROOT, "python", "analyses");

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

export async function GET(request: NextRequest) {
  const analysisId = request.nextUrl.searchParams.get("analysisId");

  let dataDir: string;
  let outputDir: string;
  let targetsFile: string;

  if (analysisId) {
    // Per-analysis paths
    if (!/^[a-f0-9-]{4,36}$/.test(analysisId)) {
      return NextResponse.json({ error: "Invalid analysis ID" }, { status: 400 });
    }
    const analysisBase = join(ANALYSES_DIR, analysisId);
    if (!existsSync(analysisBase)) {
      return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
    }
    dataDir = join(analysisBase, "input");
    outputDir = join(analysisBase, "output");
    targetsFile = "targets.json";
  } else {
    // Default Mongolia pilot
    dataDir = PYTHON_DATA;
    outputDir = PYTHON_OUTPUT;
    targetsFile = "mongolia-targets.json";
  }

  const targets = readJson<unknown[]>(join(dataDir, targetsFile));
  const categories = readJson<{
    nbs_categories: unknown[];
    ipcc_sectors?: unknown[];
    themes?: unknown[];
    _themes_deprecated?: unknown[];
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
        error: analysisId
          ? "Analysis results not yet available. The pipeline may still be running."
          : "Pipeline output not found. Run the pipeline first: cd python && uv run python -m src.run_analysis",
        missing: [
          !targets && "targets",
          !categories && "categories",
          !classifications && "classifications",
          !alignment && "alignment",
        ].filter(Boolean),
      },
      { status: 404 }
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

  // Country-specific provenance and display config (e.g. doc citation strings
  // for the Data Sources chips). Optional; falls back to empty object when
  // absent, so the frontend can show a chip without a provenance tooltip.
  const countryConfig = readJson<Record<string, unknown>>(
    join(dataDir, deriveCountryFile(targetsFile, "country-config"))
  );

  // Load NR7 progress data if available
  const externalDir = join(PROJECT_ROOT, "python", "data", "external");
  const country = (enrichedTargets[0] as Record<string, unknown>)?.country as string | undefined;
  let nr7Data = null;
  if (country) {
    const countryLower = country.toLowerCase();
    const isoMap2: Record<string, string> = { mongolia: "mng", panama: "pan", morocco: "mar" };
    const iso3Lower = isoMap2[countryLower] || country.slice(0, 3).toLowerCase();
    const nr7Path = join(externalDir, `nr7_${iso3Lower}.json`);
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

  // Load environmental footprint snapshot if available
  const footprint = readJson<Record<string, unknown>>(
    join(outputDir, "footprint.json")
  );

  return NextResponse.json({
    targets: allTargets,
    nbsCategories: categories.nbs_categories,
    sectors: categories.ipcc_sectors ?? [],
    themes: categories.themes ?? categories._themes_deprecated ?? [],
    classifications,
    alignment: allAlignment,
    btrData: btrData ?? null,
    nr7Data: nr7Data ?? null,
    footprint: footprint ?? null,
    countryConfig: countryConfig ?? null,
  });
}
