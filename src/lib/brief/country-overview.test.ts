import { describe, expect, it } from "vitest";
import { countryOverview } from "./country-overview";

// On the committed data, not fixtures: the landing has to show what the
// country's brief opens with.
describe("countryOverview", () => {
  it("has nothing for a country that is not in the registry", () => {
    expect(countryOverview("atlantis")).toBeNull();
  });

  it("gives Panama's brief figures: its four standard documents, without the hidden ones or the reported actions", () => {
    // Read off /panama/brief (2026-10-05): 4 policy documents, 100 targets,
    // 3,613 target pairs compared. The old landing wheel drew 5 documents.
    const overview = countryOverview("panama");
    expect(overview).not.toBeNull();
    const { documents, targets, counts } = overview!;
    expect([documents, targets, counts.total]).toEqual([4, 100, 3613]);
    expect(counts.reinforce + counts.partial + counts.apart + counts.none).toBe(3613);
  });
});
