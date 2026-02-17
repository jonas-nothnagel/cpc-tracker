import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, copyFileSync } from "fs";
import { join } from "path";
import type { PolicyDocumentType } from "@/types";

/**
 * POST /api/analyze
 *
 * Accepts targets + country + optional custom categories,
 * creates an analysis run, spawns the Python pipeline, returns the analysis ID.
 */

const MAX_TARGETS = 150;

interface AnalyzeRequest {
  country: string;
  targets: {
    text: string;
    sourceDocument: PolicyDocumentType;
    sourceLabel: string;
  }[];
  /** Optional custom NBS categories (if omitted, uses defaults) */
  nbsCategories?: { id: string; name: string; description: string }[];
  /** Optional custom themes (if omitted, uses defaults) */
  themes?: { id: string; name: string; description: string }[];
}

const PROJECT_ROOT = process.cwd();
const ANALYSES_DIR = join(PROJECT_ROOT, "python", "analyses");
const DEFAULT_CATEGORIES = join(PROJECT_ROOT, "python", "data", "categories.json");

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();

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
      };
    });

    // Write targets
    writeFileSync(
      join(inputDir, "targets.json"),
      JSON.stringify(targets, null, 2)
    );

    // Write categories (custom if provided, otherwise copy defaults)
    if (body.nbsCategories || body.themes) {
      const categories = {
        nbs_categories: body.nbsCategories ?? [],
        themes: body.themes ?? [],
      };
      writeFileSync(
        join(inputDir, "categories.json"),
        JSON.stringify(categories, null, 2)
      );
    } else {
      copyFileSync(DEFAULT_CATEGORIES, join(inputDir, "categories.json"));
    }

    // Write initial status
    writeFileSync(
      join(outputDir, "status.json"),
      JSON.stringify({
        status: "starting",
        step: 0,
        totalSteps: 5,
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
        },
        stdio: "ignore",
        detached: true,
      }
    );
    child.unref();

    return NextResponse.json({ analysisId: id });
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
