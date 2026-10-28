// @vitest-environment node
import { gzipSync } from "zlib";
import { describe, expect, it } from "vitest";
import { briefFixture } from "../test-fixture";
import { loadContracts } from "./load";
import { packSetup, unpackSetup } from "./pack";
import { contractsSetup } from "./setup";
import { setupFixture } from "./test-fixture";

describe("the record's contracts as columns", () => {
  it("come back exactly as they went in", () => {
    const setup = setupFixture();
    expect(unpackSetup(packSetup(setup))).toEqual(setup);
  });

  it("leave a setup that is already unpacked as it is", () => {
    const setup = setupFixture();
    expect(unpackSetup(setup)).toBe(setup);
  });

  it("carry Mongolia's whole record, a quarter lighter to download", () => {
    const file = loadContracts("mongolia");
    expect(file).not.toBeNull();
    const setup = contractsSetup({ file: file!, source: briefFixture() });
    const packed = packSetup(setup);
    expect(unpackSetup(JSON.parse(JSON.stringify(packed)))).toEqual(setup);
    const gz = (value: unknown) => gzipSync(JSON.stringify(value)).length;
    expect(gz(packed)).toBeLessThan(gz(setup) * 0.8);
  });
});
