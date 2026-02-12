/**
 * Serves pipeline output for the dashboard.
 * Reads from python/output/ and python/data/ — no hardcoded data.
 */

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

const PROJECT_ROOT = process.cwd();
const PYTHON_OUTPUT = join(PROJECT_ROOT, "python", "output");
const PYTHON_DATA = join(PROJECT_ROOT, "python", "data");

function readJson<T>(filePath: string): T | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function GET() {
  const targets = readJson<unknown[]>(join(PYTHON_DATA, "mongolia-targets.json"));
  const categories = readJson<{ nbs_categories: unknown[]; themes: unknown[] }>(
    join(PYTHON_DATA, "categories.json")
  );
  const classifications = readJson<unknown[]>(join(PYTHON_OUTPUT, "classifications.json"));
  const alignment = readJson<unknown[]>(join(PYTHON_OUTPUT, "alignment.json"));
  const quantFlags = readJson<
    { targetId: string; isQuantitative: boolean; isTimeBound: boolean; quantitativeDetails?: string; timeBoundDetails?: string }[]
  >(
    join(PYTHON_OUTPUT, "quantitative_flags.json")
  );

  if (!targets || !categories || !classifications || !alignment) {
    return NextResponse.json(
      {
        error: "Pipeline output not found. Run the pipeline first: cd python && uv run python -m src.run_analysis",
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

  const enrichedTargets = targets.map((t: Record<string, unknown>) => {
    const flags = flagsByTarget.get(String(t.id));
    return {
      ...t,
      isQuantitative: flags?.isQuantitative ?? false,
      isTimeBound: flags?.isTimeBound ?? false,
      quantitativeDetails: flags?.quantitativeDetails ?? undefined,
      timeBoundDetails: flags?.timeBoundDetails ?? undefined,
    };
  });

  return NextResponse.json({
    targets: enrichedTargets,
    nbsCategories: categories.nbs_categories,
    themes: categories.themes,
    classifications,
    alignment,
  });
}
