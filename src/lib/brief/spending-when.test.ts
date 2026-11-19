import { describe, expect, it } from "vitest";
import { spendingRecord, spendingSetup } from "./spending";
import { legacyPayload, levelsPayload } from "./spending-fixture";
import { spendingAround } from "./spending-when";
import { briefFixture } from "./test-fixture";

const SOURCE = briefFixture();
/** Tugrik billion: 2020 holds ₮4 (US$2.0 million), 2021 ₮6 (US$2.4 million),
 *  2022 the local budgets only, ₮5 (US$1.67 million). */
const LEVELS = spendingRecord(spendingSetup(levelsPayload(), SOURCE)!);
/** US$ million: 2020 holds 4, 2021 holds 6. */
const LEGACY = spendingRecord(spendingSetup(legacyPayload(), SOURCE)!);

describe("spendingAround", () => {
  it("sets every charted year before, in or after the document's year", () => {
    expect(spendingAround(LEVELS, 2019).when).toEqual(["after", "after", "after"]);
    expect(spendingAround(LEVELS, 2021).when).toEqual(["before", "at", "after"]);
    expect(spendingAround(LEVELS, 2022).when).toEqual(["before", "before", "at"]);
    expect(spendingAround(LEVELS, 2025).when).toEqual(["before", "before", "before"]);
  });

  it("adds the spending before and after, the document's own year apart from both", () => {
    const around = spendingAround(LEVELS, 2021);
    expect([around.before.years, around.before.value, around.before.usd]).toEqual([1, 4, 2_000_000]);
    expect([around.at.years, around.at.value, around.at.usd]).toEqual([1, 6, 2_400_000]);
    expect([around.after.years, around.after.value, Math.round(around.after.usd ?? 0)]).toEqual([1, 5, 1_666_667]);
  });

  it("marks an amount as a floor where one of its years lacks a part of the budget", () => {
    const around = spendingAround(LEVELS, 2021);
    expect([around.before.partial, around.at.partial, around.after.partial]).toEqual([false, false, true]);
    expect(spendingAround(LEVELS, 2019).after).toMatchObject({ years: 3, value: 15, partial: true });
    expect(spendingAround(LEVELS, 2022).at).toMatchObject({ years: 1, value: 5, partial: true });
  });

  it("covers no year, and so states no amount, on a side the record holds none on", () => {
    const early = spendingAround(LEGACY, 2015);
    expect([early.before.years, early.at.years, early.after.years]).toEqual([0, 0, 2]);
    expect([early.after.value, early.after.usd, early.after.partial]).toEqual([10, null, false]);
    const late = spendingAround(LEGACY, 2030);
    expect([late.before.years, late.before.value, late.at.years, late.after.years]).toEqual([2, 10, 0, 0]);
  });
});
