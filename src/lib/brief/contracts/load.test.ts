import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { gzipSync } from "zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readContractsAt, readRecordAt } from "./load";
import { contractsFixture } from "./test-fixture";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "cpc-contracts-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const write = (name: string, value: unknown) => writeFileSync(join(dir, name), gzipSync(JSON.stringify(value)));

describe("reading the baked files", () => {
  it("reads the payload, or nothing where there is none", () => {
    expect(readContractsAt(dir)).toBeNull();
    write("contracts.json.gz", contractsFixture());
    expect(readContractsAt(dir)?.census.contracts).toBe(40);
  });

  it("reads one contract's record with its id, or nothing for an unknown id", () => {
    write("contract-details.json.gz", {
      p1: { original: "Ногоон бүс", english: "Green belt", buyer: "Khovd", strong: [{ target: "A1", text: "Matches." }], misaligned: [] },
    });
    expect(readRecordAt(dir, "p1")).toMatchObject({ id: "p1", english: "Green belt", strong: [{ target: "A1" }] });
    expect(readRecordAt(dir, "nope")).toBeNull();
  });
});
