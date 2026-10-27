import { NextRequest, NextResponse } from "next/server";
import { IS_SERVERLESS } from "@/lib/upload/boot";
import { readDraft } from "@/lib/upload/draft";
import { startReading } from "@/lib/upload/reading";

/**
 * POST /api/upload/[id]/read
 *
 * Starts reading the draft's documents that wait to be read (or failed), two
 * at a time, in the background. Nothing is sent to the AI before this.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (IS_SERVERLESS) {
    return NextResponse.json({ error: "Uploads need a server that can run Python.", code: "unavailable" }, { status: 501 });
  }
  const { id } = await params;
  const draft = readDraft(id);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (draft.started) return NextResponse.json({ error: "The analysis has started" }, { status: 409 });
  return NextResponse.json({ draft: startReading(id) });
}
