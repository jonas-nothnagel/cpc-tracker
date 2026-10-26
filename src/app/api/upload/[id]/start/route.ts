import { mkdirSync } from "fs";
import { join } from "path";
import { NextRequest, NextResponse } from "next/server";
import { recordExtractionReview } from "@/lib/feedback/extraction-review";
import { buildExtractionReviewEvent, type ExtractedItem } from "@/lib/upload-helpers";
import { buildAnalysisInputs, checkAnalyzeBody, writeAnalysisInputs } from "@/lib/upload/analysis-inputs";
import { IS_SERVERLESS } from "@/lib/upload/boot";
import { analysesDir, toAnalyzeBody, updateDraft } from "@/lib/upload/draft";
import { writeJsonAtomic } from "@/lib/upload/files";
import { allowStart, enqueue, pump } from "@/lib/upload/queue";
import { freshDraft } from "@/lib/upload/reading";
import type { Draft } from "@/lib/upload/types";

/**
 * POST /api/upload/[id]/start   { clientId }
 *
 * Starts the analysis a draft asks for, under the draft's own id: checks it
 * before anything is spent, writes its inputs, records the reviewer's
 * corrections to each reading, and puts it in line. Pressed twice, or in two
 * tabs, it starts one analysis.
 */

const fail = (status: number, code: string, more: Record<string, unknown> = {}) =>
  NextResponse.json({ code, ...more }, { status });

/** One review event per document the AI read: what was kept, edited,
 *  removed or added by hand. */
function recordReviews(draft: Draft, clientId: string): void {
  for (const doc of draft.documents) {
    if (doc.source !== "read" || doc.state !== "read") continue;
    const items: ExtractedItem[] = doc.targets.map((t) => ({
      text: t.text,
      label: t.label,
      sourceDocument: doc.code,
      accepted: !t.removed,
      ...(t.initialText !== undefined ? { initialText: t.initialText } : {}),
      ...(t.initialLabel !== undefined ? { initialLabel: t.initialLabel } : {}),
      ...(t.added ? { manuallyAdded: true } : {}),
      ...(t.textCleanup ? { textCleanup: t.textCleanup } : {}),
      ...(t._provenanceFlag ? { _provenanceFlag: t._provenanceFlag } : {}),
    }));
    recordExtractionReview(
      buildExtractionReviewEvent(items, {
        countryRaw: draft.country,
        fileName: doc.fileName,
        docType: doc.code,
        outcome: "accepted",
        clientId,
        locale: draft.locale,
      }),
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (IS_SERVERLESS) return fail(501, "unavailable");
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const clientId = typeof body?.clientId === "string" ? body.clientId.slice(0, 64) : "";

  const draft = freshDraft(id);
  if (!draft) return fail(404, "missing");
  if (draft.started) return fail(409, "started", { analysisId: id });
  if (draft.documents.some((d) => d.state === "queued" || d.state === "reading")) return fail(409, "reading");

  const analysis = toAnalyzeBody(draft);
  const checked = checkAnalyzeBody(analysis);
  if (!checked.ok) return fail(400, checked.code, { error: checked.error });
  if (!allowStart()) return fail(429, "busy");

  // Decided in one synchronous update: of two presses, one starts.
  let won = false;
  updateDraft(id, (d) => {
    if (!d.started) {
      d.started = true;
      won = true;
    }
  });
  if (!won) return fail(409, "started", { analysisId: id });

  try {
    const input = join(analysesDir(), id, "input");
    const output = join(analysesDir(), id, "output");
    mkdirSync(input, { recursive: true });
    mkdirSync(output, { recursive: true });
    writeAnalysisInputs({ input, output }, buildAnalysisInputs(analysis), {
      categories: join(process.cwd(), "python", "data", "categories.json"),
      btrData: analysis.btrData,
      initialFootprint: analysis.initialFootprint,
    });
    writeJsonAtomic(join(output, "status.json"), {
      status: "queued",
      step: 0,
      totalSteps: 8,
      currentStep: "Waiting",
      message: "",
      startedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      summary: null,
    });
    recordReviews(draft, clientId);
    enqueue(id);
    pump();
  } catch (err) {
    console.error("Start failed:", err instanceof Error ? err.message : err);
    updateDraft(id, (d) => {
      d.started = false;
    });
    return fail(500, "generic");
  }
  return NextResponse.json({ analysisId: id });
}
