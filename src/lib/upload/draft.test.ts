import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analysesDir,
  applyChanges,
  createDraft,
  isDraftId,
  pruneDrafts,
  readDraft,
  toAnalyzeBody,
  updateDraft,
} from "./draft";
import type { DraftDocument } from "./types";

const readDoc = (id: string, code: string, texts: string[]): DraftDocument => ({
  id,
  source: "read",
  fileName: `${code}.pdf`,
  name: `${code} document`,
  code,
  state: "read",
  targets: texts.map((text, i) => ({ key: `${id}-${i + 1}`, label: `${i + 1}`, text, initialText: text })),
});

beforeEach(() => {
  vi.spyOn(process, "cwd").mockReturnValue(mkdtempSync(join(tmpdir(), "cpc-draft-")));
});
afterEach(() => vi.restoreAllMocks());

describe("the draft file", () => {
  it("is created under the analyses folder and read back whole", () => {
    const d = createDraft({ country: " Tonga ", locale: "es" });
    expect(isDraftId(d.id)).toBe(true);
    expect(existsSync(join(analysesDir(), d.id, "draft.json"))).toBe(true);
    expect(d).toMatchObject({ country: "Tonga", locale: "es", documents: [], started: false, nextDoc: 1 });
    expect(readDraft(d.id)).toEqual(d);
  });

  it("reads own policy areas kept without a word in them as none, so they never block the start", () => {
    const d = createDraft({ country: "Panama", locale: "en" });
    writeFileSync(
      join(analysesDir(), d.id, "draft.json"),
      JSON.stringify({ ...d, ownLens: { name: "", areas: [{ name: "", description: "" }] } }),
    );
    expect(readDraft(d.id)?.ownLens).toBeNull();
  });

  it("is not read for a malformed id or a missing file", () => {
    expect(readDraft("../../python")).toBeNull();
    expect(readDraft("3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13")).toBeNull();
  });
});

describe("changes", () => {
  it("from two tabs on different fields both persist", () => {
    const d = createDraft({ locale: "en" });
    updateDraft(d.id, (x) => {
      x.documents.push(readDoc("d1", "NDC", ["One", "Two"]));
    });
    updateDraft(d.id, (x) => applyChanges(x, [{ op: "target", docId: "d1", key: "d1-1", text: "One, edited" }]));
    updateDraft(d.id, (x) => applyChanges(x, [{ op: "target", docId: "d1", key: "d1-2", removed: true }]));
    expect(readDraft(d.id)!.documents[0].targets.map((t) => [t.text, t.removed])).toEqual([
      ["One, edited", undefined],
      ["Two", true],
    ]);
  });

  it("restore a removed target", () => {
    const d = createDraft({ locale: "en" });
    d.documents.push(readDoc("d1", "NDC", ["One"]));
    applyChanges(d, [{ op: "target", docId: "d1", key: "d1-1", removed: true }]);
    applyChanges(d, [{ op: "target", docId: "d1", key: "d1-1", removed: false }]);
    expect(d.documents[0].targets[0].removed).toBeUndefined();
  });

  it("leave a document that is still being read alone", () => {
    const d = createDraft({ locale: "en" });
    d.documents.push({ ...readDoc("d1", "NDC", ["One"]), state: "reading" });
    applyChanges(d, [
      { op: "target", docId: "d1", key: "d1-1", text: "Edited" },
      { op: "addTarget", docId: "d1", label: "9", text: "New" },
    ]);
    expect(d.documents[0].targets.map((t) => t.text)).toEqual(["One"]);
  });

  it("rename a document, but never to a code that is taken or that the pipeline reserves", () => {
    const d = createDraft({ locale: "en" });
    d.documents.push(readDoc("d1", "NDC", ["One"]), readDoc("d2", "NAP", ["Two"]));
    applyChanges(d, [
      { op: "document", id: "d2", name: "  National   Adaptation Plan 2030 ", code: "ndc" },
      { op: "document", id: "d1", code: "BTR" },
    ]);
    expect(d.documents.map((x) => [x.name, x.code])).toEqual([
      ["NDC document", "NDC"],
      ["National Adaptation Plan 2030", "NAP"],
    ]);
    applyChanges(d, [{ op: "document", id: "d2", code: "NAP2030" }]);
    expect(d.documents[1].code).toBe("NAP2030");
  });

  it("name a document after its file again when its name is cleared", () => {
    const d = createDraft({ locale: "en" });
    d.documents.push({ ...readDoc("d1", "NWRP", ["One"]), fileName: "National_Water_Resource_Policy.pdf" });
    applyChanges(d, [{ op: "document", id: "d1", name: "Water" }]);
    applyChanges(d, [{ op: "document", id: "d1", name: "   " }]);
    expect(d.documents[0].name).toBe("National Water Resource Policy");
  });

  it("let the short name follow the name until it is set by hand", () => {
    const d = createDraft({ locale: "en" });
    d.documents.push(readDoc("d1", "DOC1", ["One"]), readDoc("d2", "NAP", ["Two"]));
    applyChanges(d, [{ op: "document", id: "d1", name: "National Livestock Programme" }]);
    expect(d.documents[0].code).toBe("NLP");
    applyChanges(d, [{ op: "document", id: "d1", code: "LIV" }]);
    applyChanges(d, [{ op: "document", id: "d1", name: "Nationally Determined Contribution 3.0" }]);
    expect(d.documents[0]).toMatchObject({ name: "Nationally Determined Contribution 3.0", code: "LIV" });
  });

  it("add a target the reviewer types in, marked as added", () => {
    const d = createDraft({ locale: "en" });
    d.documents.push(readDoc("d1", "NDC", ["One"]));
    applyChanges(d, [{ op: "addTarget", docId: "d1", label: " 4.2 ", text: " Restore 30%\nof wetlands " }]);
    expect(d.documents[0].targets[1]).toEqual({ key: "d1-a1", label: "4.2", text: "Restore 30% of wetlands", added: true });
  });

  it("let two tabs each add a target and edit only their own", () => {
    const server = createDraft({ locale: "en" });
    server.documents.push(readDoc("d1", "NDC", ["Cut emissions"]));
    const tabB = structuredClone(server);
    applyChanges(server, [{ op: "addTarget", docId: "d1", key: "d1-a1b2c3d4", label: "A1", text: "Tab A's target" }]);
    const addB = { op: "addTarget" as const, docId: "d1", key: "d1-a9f8e7d6", label: "B1", text: "Tab B's target" };
    applyChanges(tabB, [addB]);
    applyChanges(server, [addB]);
    applyChanges(server, [{ op: "target", docId: "d1", key: "d1-a9f8e7d6", removed: true }]);
    expect(server.documents[0].targets.map((t) => [t.text, !!t.removed])).toEqual([
      ["Cut emissions", false],
      ["Tab A's target", false],
      ["Tab B's target", true],
    ]);
  });

  it("never reuses a target key, whatever key arrives", () => {
    const d = createDraft({ locale: "en" });
    d.documents.push(readDoc("d1", "NDC", ["One"]));
    applyChanges(d, [
      { op: "addTarget", docId: "d1", key: "d1-1", label: "", text: "Taken key" },
      { op: "addTarget", docId: "d1", key: "../x", label: "", text: "Bad key" },
      { op: "addTarget", docId: "d1", label: "", text: "No key" },
    ]);
    const keys = d.documents[0].targets.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.slice(1).every((k) => /^d1-a[0-9a-z]+$/.test(k))).toBe(true);
  });

  it("keep no own policy areas when the set is left without a word in it", () => {
    const d = createDraft({ country: "Tonga", locale: "en" });
    applyChanges(d, [{ op: "ownLens", value: { name: " ", source: "", areas: [{ name: "", description: "" }] } }]);
    expect(d.ownLens).toBeNull();
    applyChanges(d, [{ op: "ownLens", value: { name: "National priorities", areas: [{ name: "", description: "" }] } }]);
    expect(d.ownLens).toEqual({ name: "National priorities", areas: [{ name: "", description: "" }] });
  });

  it("stop once the analysis has started", () => {
    const d = createDraft({ country: "Tonga", locale: "en" });
    d.started = true;
    applyChanges(d, [{ op: "country", value: "Fiji" }]);
    expect(d.country).toBe("Tonga");
  });
});

describe("toAnalyzeBody", () => {
  it("sends the kept targets under each document's code, with the documents' names", () => {
    const d = createDraft({ country: "Tonga", locale: "en" });
    d.documents.push(readDoc("d1", "NDC", ["One", "Two"]), readDoc("d2", "NWRP", ["Three"]), {
      ...readDoc("d3", "NAP", []),
      state: "noText",
    });
    d.documents[0].targets[1].removed = true;
    d.btr = { fileNames: ["btr.xlsx"], data: { mitigationMeasures: [{}] }, actions: 1 };
    const body = toAnalyzeBody(d);
    expect(body.documents).toEqual([
      { code: "NDC", name: "NDC document" },
      { code: "NWRP", name: "NWRP document" },
    ]);
    expect(body.targets.map((t) => [t.sourceDocument, t.sourceLabel, t.text])).toEqual([
      ["NDC", "1", "One"],
      ["NWRP", "1", "Three"],
    ]);
    expect(body).toMatchObject({ country: "Tonga", locale: "en", btrData: { mitigationMeasures: [{}] } });
  });
});

describe("pruneDrafts", () => {
  it("removes drafts untouched for 30 days that never started, and nothing else", () => {
    const now = new Date("2026-11-30T12:00:00Z");
    const old = createDraft({ locale: "en" });
    const started = createDraft({ locale: "en" });
    const fresh = createDraft({ locale: "en" });
    const stamp = (id: string, at: string, more: Record<string, unknown> = {}) =>
      writeFileSync(join(analysesDir(), id, "draft.json"), JSON.stringify({ ...readDraft(id), updatedAt: at, ...more }));
    stamp(old.id, "2026-10-30T11:00:00Z");
    stamp(started.id, "2026-10-01T00:00:00Z", { started: true });
    stamp(fresh.id, "2026-11-29T00:00:00Z");
    const analysis = join(analysesDir(), "ad72aee6-4840-4586-9e6d-4da458aa5ed4", "output");
    mkdirSync(analysis, { recursive: true });
    utimesSync(analysis, new Date("2020-01-01"), new Date("2020-01-01"));

    expect(pruneDrafts(now)).toEqual([old.id]);
    expect(readDraft(old.id)).toBeNull();
    expect(readDraft(started.id)).not.toBeNull();
    expect(readDraft(fresh.id)).not.toBeNull();
    expect(existsSync(analysis)).toBe(true);
  });
});
