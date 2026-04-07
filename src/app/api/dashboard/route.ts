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

  const btrData = readJson<unknown>(join(outputDir, "btr_data.json"));

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
  });
}
