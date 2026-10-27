// @vitest-environment node
// (multipart bodies need Node's own FormData and File, not jsdom's)
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { parseBtrTables, parseTargetsTable } = vi.hoisted(() => ({
  parseBtrTables: vi.fn(),
  parseTargetsTable: vi.fn(),
}));
vi.mock("@/lib/upload/tables", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/upload/tables")>()),
  parseBtrTables,
  parseTargetsTable,
}));

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(process, "cwd").mockReturnValue(mkdtempSync(join(tmpdir(), "cpc-documents-")));
});
afterEach(() => {
  vi.restoreAllMocks();
  parseBtrTables.mockReset();
  parseTargetsTable.mockReset();
});

/** Post one spreadsheet to a fresh draft that another tab starts while the file is parsed. */
async function addWhileStarted(fileName: string, parser: typeof parseBtrTables, parsed: unknown) {
  const { createDraft, readDraft, updateDraft } = await import("@/lib/upload/draft");
  const draft = createDraft({ country: "Tonga", locale: "en" });
  parser.mockImplementation(async () => {
    updateDraft(draft.id, (d) => {
      d.started = true;
    });
    return parsed;
  });
  const { POST } = await import("./route");
  const form = new FormData();
  form.set("file", new File([new Uint8Array([80, 75, 3, 4])], fileName));
  const res = await POST(new NextRequest(`http://localhost/api/upload/${draft.id}/documents`, { method: "POST", body: form }), {
    params: Promise.resolve({ id: draft.id }),
  });
  return { res, after: readDraft(draft.id)! };
}

describe("POST /api/upload/[id]/documents", () => {
  it("leaves a draft that started while a BTR workbook was parsed as it started", async () => {
    const { res, after } = await addWhileStarted("BTR CTF tables.xlsx", parseBtrTables, { mitigationMeasures: [{}, {}] });
    expect(res.status).toBe(409);
    expect(after.btr).toBeNull();
  });

  it("leaves a draft that started while a targets spreadsheet was parsed as it started", async () => {
    const { res, after } = await addWhileStarted("targets.xlsx", parseTargetsTable, [
      { document: "NDC", label: "1", text: "Cut emissions by 20%" },
    ]);
    expect(res.status).toBe(409);
    expect(after.documents).toEqual([]);
  });
});
