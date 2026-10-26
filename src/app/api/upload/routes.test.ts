import { existsSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Spreadsheets are parsed by Python; nothing here needs it, so a spawn is a failure.
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  const spawn = () => {
    throw new Error("no Python in these tests");
  };
  return { ...actual, default: { ...actual, spawn }, spawn };
});

let root = "";
beforeEach(() => {
  vi.resetModules();
  root = mkdtempSync(join(tmpdir(), "cpc-upload-"));
  vi.spyOn(process, "cwd").mockReturnValue(root);
});
afterEach(() => vi.restoreAllMocks());

const json = (body: unknown, method = "POST") =>
  new NextRequest("http://localhost/api/upload", { method, body: JSON.stringify(body) });
const get = () => new NextRequest("http://localhost/api/upload");
const withFile = (file: File) => {
  const form = new FormData();
  form.set("file", file);
  return { formData: async () => form } as unknown as NextRequest;
};
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function newDraft(country = "Tonga") {
  const { POST } = await import("./route");
  const res = await POST(json({ country, locale: "es" }));
  return { res, draft: (await res.json()).draft };
}

describe("POST /api/upload", () => {
  it("creates a draft under the analyses folder", async () => {
    const { res, draft } = await newDraft();
    expect(res.status).toBe(201);
    expect(draft).toMatchObject({ country: "Tonga", locale: "es", documents: [] });
    expect(existsSync(join(root, "python", "analyses", draft.id, "draft.json"))).toBe(true);
  });
});

describe("POST /api/upload/{id}/documents", () => {
  it("keeps a PDF to be read later, named after its file", async () => {
    const { draft } = await newDraft();
    const { POST } = await import("./[id]/documents/route");
    const res = await POST(withFile(new File(["%PDF-1.4"], "Updated_NDC 2021.pdf")), params(draft.id));
    expect(res.status).toBe(200);
    const doc = (await res.json()).draft.documents[0];
    expect(doc).toMatchObject({ id: "d1", source: "read", state: "added", name: "Updated NDC 2021", code: "NDC" });
    expect(readFileSync(join(root, "python", "analyses", draft.id, "documents", "d1", "source.pdf"), "utf8")).toBe(
      "%PDF-1.4",
    );
  });

  it("reads a CSV of targets into one document per document it names", async () => {
    const { draft } = await newDraft();
    const { POST } = await import("./[id]/documents/route");
    const csv = "Label,Text,Document type\nT1,Restore 30% of wetlands,NBSAP\nT2,Cut emissions by 20%,NDC\n";
    const res = await POST(withFile(new File([csv], "targets.csv")), params(draft.id));
    const docs = (await res.json()).draft.documents;
    expect(docs.map((d: { code: string; state: string; targets: unknown[] }) => [d.code, d.state, d.targets.length])).toEqual([
      ["NBSAP", "read", 1],
      ["NDC", "read", 1],
    ]);
  });

  it("refuses other kinds of files and files over 50 MB", async () => {
    const { draft } = await newDraft();
    const { POST } = await import("./[id]/documents/route");
    const exe = await POST(withFile(new File(["MZ"], "plan.exe")), params(draft.id));
    expect(exe.status).toBe(400);
    expect(await exe.json()).toMatchObject({ code: "type" });
    const big = await POST(withFile(new File([new Uint8Array(51 * 1024 * 1024)], "big.pdf")), params(draft.id));
    expect(big.status).toBe(413);
    expect(await big.json()).toMatchObject({ code: "tooLarge" });
  });

  it("keeps the 15 MB cap on spreadsheets, which are unpacked in memory", async () => {
    const { draft } = await newDraft();
    const { POST } = await import("./[id]/documents/route");
    const res = await POST(withFile(new File([new Uint8Array(16 * 1024 * 1024)], "targets.xlsx")), params(draft.id));
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ code: "tableTooLarge" });
  });

  it("says when a CSV holds no targets", async () => {
    const { draft } = await newDraft();
    const { POST } = await import("./[id]/documents/route");
    const res = await POST(withFile(new File([""], "empty.csv")), params(draft.id));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: "noTargets" });
  });
});

describe("GET and PATCH /api/upload/{id}", () => {
  it("answers 404 for a draft that does not exist", async () => {
    const { GET } = await import("./[id]/route");
    const res = await GET(get(), params("3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13"));
    expect(res.status).toBe(404);
  });

  it("applies the page's changes and deletes a removed document's files", async () => {
    const { draft } = await newDraft();
    const docs = await import("./[id]/documents/route");
    await docs.POST(withFile(new File(["%PDF-1.4"], "NAP.pdf")), params(draft.id));
    const { PATCH, GET } = await import("./[id]/route");
    const res = await PATCH(
      json({ changes: [{ op: "country", value: "Fiji" }, { op: "removeDocument", id: "d1" }] }, "PATCH"),
      params(draft.id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).draft).toMatchObject({ country: "Fiji", documents: [] });
    expect(existsSync(join(root, "python", "analyses", draft.id, "documents", "d1"))).toBe(false);
    expect(await (await GET(get(), params(draft.id))).json()).toMatchObject({ ahead: 0 });
  });

  it("refuses changes once the analysis has started", async () => {
    const { draft } = await newDraft();
    const { updateDraft } = await import("@/lib/upload/draft");
    updateDraft(draft.id, (x) => {
      x.started = true;
    });
    const { PATCH } = await import("./[id]/route");
    const res = await PATCH(json({ changes: [{ op: "country", value: "Fiji" }] }, "PATCH"), params(draft.id));
    expect(res.status).toBe(409);
  });
});
