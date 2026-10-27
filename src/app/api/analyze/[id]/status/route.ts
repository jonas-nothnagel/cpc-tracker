import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { pump, recover, runState } from "@/lib/upload/queue";

/**
 * GET /api/analyze/[id]/status
 *
 * Returns the current status of an analysis, with where it stands in line
 * (`state`, `ahead`). Every look also moves the line: a run that went quiet
 * goes back in line once, and the next analysis starts when none runs.
 */

const PROJECT_ROOT = process.cwd();
const ANALYSES_DIR = join(PROJECT_ROOT, "python", "analyses");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate ID format (short UUID segment)
  if (!/^[a-f0-9-]{4,36}$/.test(id)) {
    return NextResponse.json({ error: "Invalid analysis ID" }, { status: 400 });
  }

  try {
    recover();
    pump();
  } catch (err) {
    console.error("Queue on a status look:", err instanceof Error ? err.message : err);
  }

  const statusPath = join(ANALYSES_DIR, id, "output", "status.json");

  if (!existsSync(statusPath)) {
    return NextResponse.json(
      { error: "Analysis not found" },
      { status: 404 }
    );
  }

  try {
    const raw = readFileSync(statusPath, "utf-8");
    const status = JSON.parse(raw);
    return NextResponse.json({ ...status, ...runState(id) });
  } catch {
    // The pipeline rewrites this file as it goes; a read can land mid-write.
    // The page tries again rather than reading a finished run as broken.
    return NextResponse.json(
      { error: "Status is being written" },
      { status: 503, headers: { "Retry-After": "2" } }
    );
  }
}
