import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));
vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, default: { ...actual, spawn: spawnMock }, spawn: spawnMock };
});

const { delimitedRows, parseBtrTables, parseTargetsTable, tableDocuments } = await import("./tables");

/** A parser process that prints `out` and exits with `code`. */
function parser(out: string, code = 0) {
  spawnMock.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    });
    queueMicrotask(() => {
      child.stdout.emit("data", Buffer.from(out));
      child.emit("close", code);
    });
    return child;
  });
}

afterEach(() => spawnMock.mockReset());

describe("parseTargetsTable", () => {
  it("runs the spreadsheet parser and returns its rows", async () => {
    parser(JSON.stringify([{ text: "Restore wetlands", sourceDocument: "NBSAP", sourceLabel: "T1" }]));
    await expect(parseTargetsTable("/tmp/x.xlsx")).resolves.toEqual([
      { text: "Restore wetlands", sourceDocument: "NBSAP", sourceLabel: "T1" },
    ]);
    expect(spawnMock.mock.calls[0][1]).toEqual(["run", "python", "-m", "src.parse_targets_excel", "--file", "/tmp/x.xlsx"]);
  });

  it("fails when the parser fails", async () => {
    parser("", 1);
    await expect(parseTargetsTable("/tmp/x.xlsx")).rejects.toThrow();
  });
});

describe("parseBtrTables", () => {
  it("runs the BTR parser for the file's kind of tables", async () => {
    parser(JSON.stringify({ mitigationMeasures: [{ name: "Solar" }] }));
    await expect(parseBtrTables("/tmp/btr.xlsx", "ndc")).resolves.toEqual({ mitigationMeasures: [{ name: "Solar" }] });
    expect(spawnMock.mock.calls[0][1]).toEqual(["run", "python", "-m", "src.parse_ctf", "/tmp/btr.xlsx", "--type", "ndc"]);
  });
});

describe("delimitedRows", () => {
  it("reads a CSV of targets with their documents", () => {
    const csv = "Label,Text,Document type\nT1,Restore 30% of wetlands,NBSAP\nT2,Cut emissions by 20%,NDC\n";
    expect(delimitedRows(csv).map((r) => [r.sourceDocument, r.sourceLabel, r.text])).toEqual([
      ["NBSAP", "T1", "Restore 30% of wetlands"],
      ["NDC", "T2", "Cut emissions by 20%"],
    ]);
  });
});

describe("tableDocuments", () => {
  it("makes one read document per document the rows name, numbered after the draft's", () => {
    const docs = tableDocuments(
      [
        { text: "A", sourceDocument: "NDC", sourceLabel: "1" },
        { text: "B", sourceDocument: "National Water Policy", sourceLabel: "" },
        { text: "C", sourceDocument: "NDC", sourceLabel: "2" },
      ],
      "targets.xlsx",
      ["NDC"],
      3,
    );
    expect(docs.map((d) => [d.id, d.source, d.state, d.name, d.code, d.targets.length])).toEqual([
      ["d3", "table", "read", "Nationally Determined Contribution", "NDC2", 2],
      ["d4", "table", "read", "National Water Policy", "NWP", 1],
    ]);
    expect(docs[0].targets[1]).toEqual({ key: "d3-2", label: "2", text: "C" });
  });

  it("names a document the rows do not name after the file, as an added document is named", () => {
    const docs = tableDocuments([{ text: "A", sourceDocument: "", sourceLabel: "1" }], "Water_targets_2024.xlsx", [], 1);
    expect(docs.map((d) => d.name)).toEqual(["Water targets 2024"]);
  });
});
