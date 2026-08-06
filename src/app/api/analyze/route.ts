import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, copyFileSync, readFileSync } from "fs";
import { join } from "path";
import type { PolicyDocumentType, TargetSource, TextCleanup } from "@/types";

/**
 * POST /api/analyze
 *
 * Accepts targets + country + optional custom categories,
 * creates an analysis run, spawns the Python pipeline, returns the analysis ID.
 *
 * NOTE: This endpoint requires a local environment with Python and uv installed.
 * It will not work on serverless platforms like Vercel.
 */

const MAX_TARGETS = 150;
const IS_SERVERLESS = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

interface AnalyzeRequest {
  country: string;
  targets: {
    text: string;
    sourceDocument: PolicyDocumentType;
    sourceLabel: string;
    activities?: string;
    actions?: string;
    // Provenance contract from document extraction (curated-corpus shape);
    // passed through into targets.json so the dashboard can render the
    // original-language text and the verbatim audit trail for uploads too.
    textOriginal?: string;
    sourceLabelOriginal?: string;
    language?: string;
    textOriginalSource?: "source" | "machine";
    sources?: TargetSource[];
    textCleanup?: TextCleanup;
    pageNumbers?: number[];
    _provenanceFlag?: string;
  }[];
  nbsCategories?: { id: string; name: string; description: string }[];
  sectors?: { id: string; name: string; description: string }[];
  btrData?: Record<string, unknown>;
  initialFootprint?: {
    energy_wh: number;
    water_ml: number;
    co2_geq: number;
    minerals_ugsbeq: number;
    call_count: number;
    tracked_call_count: number;
    cached_call_count: number;
  };
}

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
          "You can explore the pre-computed Mongolia pilot on the Dashboard.",
      },
      { status: 501 }
    );
  }

  let body: AnalyzeRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Could not parse request body" },
      { status: 400 }
    );
  }

  if (!body.targets || body.targets.length === 0) {
    return NextResponse.json(
      { error: "No targets provided" },
      { status: 400 }
    );
  }

  if (body.targets.length > MAX_TARGETS) {
    return NextResponse.json(
      {
        error: `Too many targets (${body.targets.length}). Maximum is ${MAX_TARGETS} per analysis to keep costs under ~$1.`,
      },
      { status: 400 }
    );
  }

  try {
    const id = randomUUID().slice(0, 8);
    const inputDir = join(ANALYSES_DIR, id, "input");
    const outputDir = join(ANALYSES_DIR, id, "output");
    mkdirSync(inputDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });

    // Generate target IDs grouped by document type
    const docCounters: Record<string, number> = {};
    const targets = body.targets.map((t) => {
      const doc = t.sourceDocument;
      docCounters[doc] = (docCounters[doc] || 0) + 1;
      return {
        id: `${doc}_${docCounters[doc]}`,
        text: t.text,
        sourceDocument: doc,
        sourceLabel: t.sourceLabel || `${doc} ${docCounters[doc]}`,
        country: body.country || "Unknown",
        ...(t.activities ? { activities: t.activities } : {}),
        ...(t.actions ? { actions: t.actions } : {}),
        ...(t.textOriginal ? { textOriginal: t.textOriginal } : {}),
        ...(t.sourceLabelOriginal
          ? { sourceLabelOriginal: t.sourceLabelOriginal }
          : {}),
        ...(t.language ? { language: t.language } : {}),
        ...(t.textOriginalSource
          ? { textOriginalSource: t.textOriginalSource }
          : {}),
        ...(t.sources?.length ? { sources: t.sources } : {}),
        ...(t.textCleanup ? { textCleanup: t.textCleanup } : {}),
        ...(t.pageNumbers?.length ? { pageNumbers: t.pageNumbers } : {}),
        ...(t._provenanceFlag ? { _provenanceFlag: t._provenanceFlag } : {}),
      };
    });

    // Write targets
    writeFileSync(
      join(inputDir, "targets.json"),
      JSON.stringify(targets, null, 2)
    );

    // Write categories (custom if provided, otherwise copy defaults)
    if (body.nbsCategories || body.sectors) {
      const defaultCats = JSON.parse(readFileSync(DEFAULT_CATEGORIES, "utf-8"));
      const categories = {
        nbs_categories: body.nbsCategories ?? defaultCats.nbs_categories ?? [],
        ipcc_sectors: body.sectors ?? defaultCats.ipcc_sectors ?? [],
        globe_categories: defaultCats.globe_categories ?? [],
        // Fixed, non-user-curated taxonomy: carry the defaults through or the
        // pipeline silently produces no human rights lens for uploads.
        hr_categories: defaultCats.hr_categories ?? [],
      };
      writeFileSync(
        join(inputDir, "categories.json"),
        JSON.stringify(categories, null, 2)
      );
    } else {
      copyFileSync(DEFAULT_CATEGORIES, join(inputDir, "categories.json"));
    }

    // Write BTR data if provided (pre-parsed from Excel upload)
    if (body.btrData) {
      writeFileSync(
        join(outputDir, "btr_data.json"),
        JSON.stringify(body.btrData, null, 2)
      );
    }

    // Seed the pipeline's footprint tracker with accumulated extraction cost
    // from this session, so the final dashboard shows extraction + analysis.
    if (body.initialFootprint) {
      writeFileSync(
        join(inputDir, "initial_footprint.json"),
        JSON.stringify(body.initialFootprint, null, 2)
      );
    }

    // Write initial status
    writeFileSync(
      join(outputDir, "status.json"),
      JSON.stringify({
        status: "starting",
        step: 0,
        totalSteps: 6,
        currentStep: "Initializing pipeline",
        message: `Starting analysis for ${targets.length} targets from ${body.country || "Unknown"}`,
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
    child.unref();

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
