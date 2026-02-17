import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * GET /api/analyze/[id]/status
 *
 * Returns the current status of a running analysis.
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
    return NextResponse.json(status);
  } catch {
    return NextResponse.json(
      { error: "Could not read status" },
      { status: 500 }
    );
  }
}
