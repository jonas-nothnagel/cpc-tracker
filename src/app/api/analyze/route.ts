import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  buildAnalysisInputs,
  checkAnalyzeBody,
  writeAnalysisInputs,
  type AnalyzeBody,
} from "@/lib/upload/analysis-inputs";
import { allowStart, enqueue, pump } from "@/lib/upload/queue";

/**
 * POST /api/analyze
 *
 * Accepts the targets, the country, the wizard's language and an optional
 * set of the user's own policy areas; checks them before anything is spent;
 * writes the analysis's inputs (see src/lib/upload/analysis-inputs); puts it
 * in line for the pipeline (src/lib/upload/queue.ts); returns the analysis ID.
 *
 * NOTE: This endpoint requires a local environment with Python and uv installed.
 * It will not work on serverless platforms like Vercel.
 */

const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const PROJECT_ROOT = process.cwd();
const ANALYSES_DIR = join(PROJECT_ROOT, "python", "analyses");
const DEFAULT_CATEGORIES = join(PROJECT_ROOT, "python", "data", "categories.json");

export async function POST(request: NextRequest) {
  if (IS_SERVERLESS) {
    return NextResponse.json(
      {
        error:
          "Running new analyses is not available in the hosted preview. " +
          "The AI pipeline requires a local or Docker environment with Python. " +
          "You can explore the pre-computed country analyses on the Dashboard.",
      },
      { status: 501 }
    );
  }

  let body: AnalyzeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Could not parse request body" },
      { status: 400 }
    );
  }

  // Everything that would stop the run is checked before a slot is taken.
  const checked = checkAnalyzeBody(body);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error, code: checked.code }, { status: 400 });
  }

  // At most five starts a minute; the queue runs one analysis at a time.
  if (!allowStart()) {
    return NextResponse.json(
      { error: "Too many analyses started recently. Please wait a moment." },
      { status: 429 }
    );
  }

  try {
    // Full UUID (128-bit), not an 8-char slice: makes analysis IDs unguessable
    // so results can't be read by enumeration (defence-in-depth behind auth).
    const id = randomUUID();
    const inputDir = join(ANALYSES_DIR, id, "input");
    const outputDir = join(ANALYSES_DIR, id, "output");
    mkdirSync(inputDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });

    const inputs = buildAnalysisInputs(body);
    writeAnalysisInputs({ input: inputDir, output: outputDir }, inputs, {
      categories: DEFAULT_CATEGORIES,
      btrData: body.btrData,
      initialFootprint: body.initialFootprint,
    });

    // Write initial status
    writeFileSync(
      join(outputDir, "status.json"),
      JSON.stringify({
        status: "queued",
        step: 0,
        totalSteps: 6,
        currentStep: "Initializing pipeline",
        message: `Starting analysis for ${inputs.targets.length} targets from ${inputs.countryConfig.name}`,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        summary: null,
      })
    );

    // In line; the queue starts the pipeline when no other analysis runs.
    enqueue(id);
    pump();

    return NextResponse.json({ analysisId: id });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("Analysis setup failed:", message);
    return NextResponse.json(
      { error: `Analysis setup failed: ${message}` },
      { status: 500 }
    );
  }
}
