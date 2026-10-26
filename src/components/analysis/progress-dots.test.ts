import { describe, expect, it } from "vitest";
import { INK } from "@/components/brief/ink";
import { progressColors } from "./progress-dots";

describe("progressColors", () => {
  it("inks the pairs compared so far and leaves the rest pale", () => {
    expect(progressColors(3, 5, 1)).toEqual([INK.muted, INK.muted, INK.muted, INK.none, INK.none]);
  });

  it("draws one dot for several pairs in a large analysis", () => {
    const colors = progressColors(30000, 40000, 3);
    expect(colors).toHaveLength(13334);
    expect(colors.filter((c) => c === INK.muted)).toHaveLength(10000);
  });
});
