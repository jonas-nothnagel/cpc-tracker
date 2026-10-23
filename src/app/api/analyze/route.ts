import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  buildAnalysisInputs,
  checkAnalyzeBody,
  writeAnalysisInputs,
  type AnalyzeBody,
} from "@/lib/upload/analysis-inputs";

/**
 * POST /api/analyze
 *
 * Accepts the targets, the country, the wizard's language and an optional
 * set of the user's own policy areas; checks them before anything is spent;
 * writes the analysis's inputs (see src/lib/upload/analysis-inputs); spawns
 * the Python pipeline; returns the analysis ID.
 *
 * NOTE: This endpoint requires a local environment with Python and uv installed.
 * It will not work on serverless platforms like Vercel.
 */

// Cap concurrent detached pipeline runs so an unauthenticated flood (or a burst
// of legitimate uploads) can't spawn unbounded Python processes / LLM cost.
const MAX_CONCURRENT_ANALYSES = 3;
let inFlightAnalyses = 0;
// Sliding-window rate limit on analysis STARTS. The concurrency counter alone
// tracks only *alive* children, so a burst of fast-exiting spawns can slip past
// it; this window bounds how many analyses can be kicked off regardless of how
// long each runs — the real cap on resource/LLM-cost abuse.
const MAX_STARTS_PER_WINDOW = 5;
const RATE_WINDOW_MS = 60_000;
let recentStarts: number[] = [];
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

  if (inFlightAnalyses >= MAX_CONCURRENT_ANALYSES) {
    return NextResponse.json(
      { error: "The analysis service is busy. Please try again shortly." },
      { status: 429 }
    );
  }
  // Sliding-window rate limit (lifetime-independent burst cap).
  const nowTs = Date.now();
  recentStarts = recentStarts.filter((t) => nowTs - t < RATE_WINDOW_MS);
  if (recentStarts.length >= MAX_STARTS_PER_WINDOW) {
    return NextResponse.json(
      { error: "Too many analyses started recently. Please wait a moment." },
      { status: 429 }
    );
  }
  // Reserve the slot synchronously with the check above — there is no `await`
  // between them, so a concurrent burst can't all pass the check before any of
  // them increments (the previous code incremented only after spawn, which a
  // burst of near-simultaneous requests raced past). Released exactly once when
  // the pipeline exits/fails to start, or if setup below throws.
  inFlightAnalyses++;
  recentStarts.push(nowTs);
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      inFlightAnalyses--;
    }
  };

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
        status: "starting",
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

    // Spawn the Python pipeline in the background
    const child = spawn(
      "uv",
      [
        "run",
        "python",
        "-m",
        "src.run_analysis",
        "--targets-file",
        "targets.json",
      ],
      {
        cwd: join(PROJECT_ROOT, "python"),
        env: {
          ...process.env,
          CPC_DATA_DIR: inputDir,
          CPC_OUTPUT_DIR: outputDir,
          // Tag this run in the footprint ledger as a user upload (vs a dev CLI
          // run) and tie its rows to this analysis id. CPC_LEDGER_DIR and
          // CPC_ELECTRICITY_ZONE flow through via ...process.env (Azure app
          // settings), so they don't need to be set explicitly here.
          CPC_RUN_SOURCE: "user_pipeline",
          CPC_RUN_ID: id,
        },
        stdio: "ignore",
        detached: true,
      }
    );
    // Release the reserved slot when the detached pipeline exits or fails.
    child.on("exit", release);
    child.on("error", release);
    child.unref();

    return NextResponse.json({ analysisId: id });
  } catch (err) {
    release(); // setup failed before the child could take over the slot
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred";
    console.error("Analysis setup failed:", message);
    return NextResponse.json(
      { error: `Analysis setup failed: ${message}` },
      { status: 500 }
    );
  }
}
