import { describe, expect, it } from "vitest";
import { misalignedRows } from "./misaligned";
import { briefSide, contractsFixture } from "./test-fixture";

const file = contractsFixture();
const side = briefSide();
const docOf = new Map(side.targets.map((t) => [t.id, t.doc]));

describe("potentially misaligned", () => {
  const m = misalignedRows(file.contracts, docOf);

  it("counts the lots of one tender once", () => {
    expect(m.tenders).toBe(1);
    expect(m.contracts).toBe(3);
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0].target).toBe("C1");
    expect(m.rows[0].tenders[0].contracts).toHaveLength(3);
    expect(m.rows[0].tenders[0].value).toBe(3e9);
  });

  it("sets the target's strongly matching tenders beside them, and names the document most involved", () => {
    expect(m.rows[0].matchingTenders).toBe(2);
    expect(m.topDoc).toEqual({ doc: "C", share: 1 });
  });
});
