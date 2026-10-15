import { describe, expect, it } from "vitest";
import { getCountry } from "@/config/countries";
import { briefInEnglish } from "./language-gate";

describe("a brief opened in a language its country does not offer", () => {
  const mongolia = getCountry("mongolia")!;

  it("goes to the same page and choices in English, naming English so the switch sticks", () => {
    expect(briefInEnglish(mongolia, "es", "brief/explore", { focus: "NDC_1", layers: ["budget", "mitigation"] })).toBe(
      "/en/mongolia/brief/explore?focus=NDC_1&layers=budget&layers=mitigation",
    );
    expect(briefInEnglish(mongolia, "es", "brief", {})).toBe("/en/mongolia/brief");
  });

  it("stays where the language is offered", () => {
    expect(briefInEnglish(mongolia, "mn", "brief", { docs: "NDC" })).toBeNull();
    expect(briefInEnglish(mongolia, "en", "brief", {})).toBeNull();
    expect(briefInEnglish(getCountry("panama")!, "es", "brief", {})).toBeNull();
  });
});
