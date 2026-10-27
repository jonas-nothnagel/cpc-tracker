import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { stopReading } = vi.hoisted(() => ({ stopReading: vi.fn() }));
vi.mock("@/lib/upload/reading", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload/reading")>()),
  stopReading,
}));

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(process, "cwd").mockReturnValue(mkdtempSync(join(tmpdir(), "cpc-patch-")));
});
afterEach(() => {
  vi.restoreAllMocks();
  stopReading.mockReset();
});

describe("PATCH /api/upload/[id]", () => {
  it("stops the reading of a document that is removed, before its folder goes", async () => {
    const { createDraft, updateDraft } = await import("@/lib/upload/draft");
    const draft = createDraft({ country: "Tonga", locale: "en" });
    updateDraft(draft.id, (d) => {
      d.documents.push(
        { id: "d1", source: "read", fileName: "a.pdf", name: "A", code: "A", state: "reading", targets: [] },
        { id: "d2", source: "read", fileName: "b.pdf", name: "B", code: "B", state: "read", targets: [] },
      );
    });
    const { PATCH } = await import("./route");
    const res = await PATCH(
      new NextRequest(`http://localhost/api/upload/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ changes: [{ op: "removeDocument", id: "d1" }] }),
      }),
      { params: Promise.resolve({ id: draft.id }) },
    );
    expect(res.status).toBe(200);
    expect(stopReading).toHaveBeenCalledWith(draft.id, "d1");
    expect(stopReading).toHaveBeenCalledTimes(1);
  });
});
