import { describe, it, expect } from "vitest";
import {
  applyUnclassifiedBuckets,
  unclassifiedCategory,
  unclassifiedIdFor,
} from "./unclassified-bucket";

type Rec = Record<string, unknown>;

/** One (target, category) classification record. */
const rec = (
  targetId: string,
  categoryId: string,
  taxonomyType: string,
  score: number,
  { isPrimary = false, isRelevant = false } = {},
): Rec => ({ targetId, categoryId, taxonomyType, score, isPrimary, isRelevant });

describe("applyUnclassifiedBuckets", () => {
  it("moves a target with no relevant category into the bucket", () => {
    const input = [
      rec("t1", "hr_business", "hr", 0.2, { isPrimary: true }),
      rec("t1", "hr_gender_equality", "hr", 0.1),
    ];
    const { classifications, bucketed } = applyUnclassifiedBuckets(input);

    expect(bucketed.has("hr")).toBe(true);
    // the weak primary is demoted, so it no longer inflates its theme's row
    const weak = classifications.find((c) => c.categoryId === "hr_business")!;
    expect(weak.isPrimary).toBe(false);
    // and the target is now primary-classified into the bucket instead
    const bucket = classifications.find(
      (c) => c.categoryId === unclassifiedIdFor("hr"),
    )!;
    expect(bucket).toMatchObject({
      targetId: "t1",
      taxonomyType: "hr",
      isPrimary: true,
      derived: true,
    });
  });

  it("leaves a target with a relevant category untouched", () => {
    const input = [
      rec("t1", "hr_gender_equality", "hr", 0.9, {
        isPrimary: true,
        isRelevant: true,
      }),
      rec("t1", "hr_business", "hr", 0.1),
    ];
    const { classifications, bucketed } = applyUnclassifiedBuckets(input);

    expect(bucketed.size).toBe(0);
    expect(classifications).toEqual(input);
    expect(
      classifications.some((c) => c.categoryId === unclassifiedIdFor("hr")),
    ).toBe(false);
  });

  it("keeps exactly one primary per (target, taxonomy)", () => {
    const input = [
      rec("t1", "hr_business", "hr", 0.2, { isPrimary: true }),
      rec("t1", "hr_defenders", "hr", 0.1),
      rec("t2", "hr_participation", "hr", 0.8, {
        isPrimary: true,
        isRelevant: true,
      }),
    ];
    const { classifications } = applyUnclassifiedBuckets(input);

    for (const targetId of ["t1", "t2"]) {
      const primaries = classifications.filter(
        (c) => c.targetId === targetId && c.taxonomyType === "hr" && c.isPrimary,
      );
      expect(primaries, `${targetId} should have exactly one primary`).toHaveLength(1);
    }
  });

  it("does not touch taxonomies outside the configured set", () => {
    // `globe` has the same latent weak-primary issue but is deliberately not
    // bucketed yet — enabling it would move counts on an already-reviewed lens.
    const input = [
      rec("t1", "globe_1", "globe", 0.2, { isPrimary: true }),
      rec("t1", "hr_business", "hr", 0.2, { isPrimary: true }),
    ];
    const { classifications, bucketed } = applyUnclassifiedBuckets(input);

    expect(bucketed.has("globe")).toBe(false);
    const globeRec = classifications.find((c) => c.taxonomyType === "globe")!;
    expect(globeRec.isPrimary).toBe(true);
    expect(
      classifications.some((c) => c.categoryId === unclassifiedIdFor("globe")),
    ).toBe(false);
  });

  it("buckets a target that has records but no primary at all", () => {
    const input = [rec("t1", "hr_business", "hr", 0)];
    const { classifications } = applyUnclassifiedBuckets(input);
    expect(
      classifications.find((c) => c.categoryId === unclassifiedIdFor("hr")),
    ).toMatchObject({ targetId: "t1", isPrimary: true });
  });

  it("ignores targets with no records for the taxonomy", () => {
    const input = [rec("t1", "sector_energy", "sector", 0.9, { isPrimary: true })];
    const { classifications, bucketed } = applyUnclassifiedBuckets(input);
    expect(bucketed.size).toBe(0);
    expect(classifications).toEqual(input);
  });

  it("is a no-op on an empty list", () => {
    const { classifications, bucketed } = applyUnclassifiedBuckets([]);
    expect(classifications).toEqual([]);
    expect(bucketed.size).toBe(0);
  });

  it("marks the bucket category as derived so it is never mistaken for source data", () => {
    const cat = unclassifiedCategory("hr");
    expect(cat.derived).toBe(true);
    expect(cat.id).toBe("hr_unclassified");
    // Copy is about the analysis, not about the country's rights record.
    expect(String(cat.name)).toMatch(/no clear/i);
    expect(String(cat.description)).toMatch(/may still touch/i);
  });
});
