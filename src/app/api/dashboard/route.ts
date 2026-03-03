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
  if (quantFlags) {
    for (const f of quantFlags) {
      flagsByTarget.set(f.targetId, {
        isQuantitative: f.isQuantitative,
        isTimeBound: f.isTimeBound,
        quantitativeDetails: f.quantitativeDetails,
        timeBoundDetails: f.timeBoundDetails,
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

  return NextResponse.json({
    targets: enrichedTargets,
    nbsCategories: categories.nbs_categories,
    sectors: categories.ipcc_sectors ?? [],
    themes: categories.themes ?? categories._themes_deprecated ?? [],
    classifications,
    alignment,
    btrData: btrData ?? null,
  });
}
