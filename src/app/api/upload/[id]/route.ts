import { rmSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { applyChanges, documentDir, readDraft, updateDraft } from "@/lib/upload/draft";
import { queueLength } from "@/lib/upload/queue";
import { freshDraft, stopReading } from "@/lib/upload/reading";
import type { DraftChange } from "@/lib/upload/types";

/**
 * GET /api/upload/[id]    the draft as it stands
 * PATCH /api/upload/[id]  { changes: DraftChange[] } from the page
 *
 * Each change touches one field, so two tabs on the same draft only ever
 * overwrite what they themselves changed.
 */

const MAX_CHANGES = 200;

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  // While documents are read, every look takes in what the jobs have done.
  const draft = freshDraft(id);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  return NextResponse.json({ draft, ahead: queueLength() });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: { changes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Could not parse request body" }, { status: 400 });
  }
  const changes = Array.isArray(body?.changes) ? (body.changes as DraftChange[]) : null;
  if (!changes || changes.length > MAX_CHANGES) {
    return NextResponse.json({ error: `Between 0 and ${MAX_CHANGES} changes are accepted.` }, { status: 400 });
  }
  const before = readDraft(id);
  if (!before) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (before.started) return NextResponse.json({ error: "The analysis has started" }, { status: 409 });

  const draft = updateDraft(id, (d) => applyChanges(d, changes.filter((c) => c && typeof c === "object")));
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  // A removed document takes its file and its reading with it: a reading
  // still under way is stopped, so no more of its text goes to the model.
  const kept = new Set(draft.documents.map((d) => d.id));
  for (const doc of before.documents) {
    if (kept.has(doc.id)) continue;
    if (doc.state === "reading") stopReading(id, doc.id);
    rmSync(documentDir(id, doc.id), { recursive: true, force: true });
  }
  return NextResponse.json({ draft });
}
