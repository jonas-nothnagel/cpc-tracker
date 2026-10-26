import { NextRequest, NextResponse } from "next/server";
import { IS_SERVERLESS } from "@/lib/upload/boot";
import { isDraftId } from "@/lib/upload/draft";
import { continueRun, runState } from "@/lib/upload/queue";

/**
 * POST /api/analyze/[id]/continue   (behind the upload sign-in)
 *
 * Puts an analysis that stopped (interrupted twice, or failed) back in line.
 * It resumes from its cache: the calls already made cost nothing again.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (IS_SERVERLESS) {
    return NextResponse.json({ error: "Analyses need a server that can run Python." }, { status: 501 });
  }
  const { id } = await params;
  if (!isDraftId(id)) return NextResponse.json({ error: "Invalid analysis ID" }, { status: 400 });
  if (!continueRun(id)) return NextResponse.json({ error: "Nothing to continue", ...runState(id) }, { status: 409 });
  return NextResponse.json(runState(id), { status: 202 });
}
