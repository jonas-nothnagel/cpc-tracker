import { describe, expect, it } from "vitest";
import { briefHref, briefLocales, briefQuery, dashboardHref } from "./origin";

const ID = "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13";
const upload = { countryId: "", analysisId: ID, languages: ["es"] };
const mongolia = { countryId: "mongolia" };

describe("briefQuery", () => {
  it("asks for an analysis by its id and a country by its slug", () => {
    expect(briefQuery(upload, { a: "NDC_1", locale: "es" }).toString()).toBe(`analysis=${ID}&a=NDC_1&locale=es`);
    expect(briefQuery(mongolia, { a: "NDC_1" }).toString()).toBe("country=mongolia&a=NDC_1");
  });
});

describe("briefHref and dashboardHref", () => {
  it("link an analysis to its own address and its old dashboard view", () => {
    expect(briefHref(upload, "es")).toBe(`/es/analysis/${ID}`);
    expect(dashboardHref(upload, "en")).toBe(`/en/dashboard?analysisId=${ID}`);
  });

  it("link a country to its brief and its previous dashboard, the language always named", () => {
    expect(briefHref(mongolia, "mn")).toBe("/mn/mongolia/brief");
    expect(dashboardHref(mongolia, "mn")).toBe("/mn/dashboard?country=mongolia");
  });
});

describe("briefLocales", () => {
  it("offers English and the language the upload was started in", () => {
    expect(briefLocales(upload)).toEqual(["en", "es"]);
    expect(briefLocales({ countryId: "", analysisId: ID })).toEqual(["en"]);
  });

  it("offers a country's own languages", () => {
    expect(briefLocales(mongolia)).toEqual(["en", "mn"]);
    expect(briefLocales({ countryId: "atlantis" })).toEqual(["en"]);
  });
});
