import { describe, expect, it } from "vitest";
import { getCountry } from "@/config/countries";
import { briefCountries, briefDetour, briefInEnglish, briefStaticParams } from "./language-gate";

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

describe("the brief pages built at deploy", () => {
  it("are every visible country's in English, and each country's own language", () => {
    const ids = (locale: string) => briefCountries(locale).map((c) => c.id);
    expect(ids("en")).toEqual(expect.arrayContaining(["mongolia", "panama", "sri-lanka"]));
    expect(ids("mn")).toEqual(["mongolia"]);
    expect(ids("es")).toEqual(["panama"]);
  });

  it("give a language no country offers a placeholder, so every other brief is still built", () => {
    expect(briefStaticParams("es")).toEqual([{ country: "panama" }]);
    const [placeholder] = briefStaticParams("fr");
    expect(briefStaticParams("fr")).toHaveLength(1);
    expect(getCountry(placeholder.country)).toBeUndefined();
  });

  it("send an address in a language the country does not offer to English, link and all", () => {
    expect(briefDetour("/es/mongolia/brief", "?docs=NDC%2CNBSAP&layers=budget")).toBe(
      "/en/mongolia/brief?docs=NDC%2CNBSAP&layers=budget",
    );
    expect(briefDetour("/mn/panama/brief/explore", "?focus=NDC_1")).toBe("/en/panama/brief/explore?focus=NDC_1");
    expect(briefDetour("/es/mongolia/brief/contracts", "")).toBe("/en/mongolia/brief/contracts");
    // The link exactly as it came, and any page under the brief.
    expect(briefDetour("/es/mongolia/brief/explore", "?focus=A1&pair=A1~B1")).toBe(
      "/en/mongolia/brief/explore?focus=A1&pair=A1~B1",
    );
    expect(briefDetour("/es/mongolia/brief/print", "")).toBe("/en/mongolia/brief/print");
  });

  it("send another spelling or an alias of a country to its own id", () => {
    expect(briefDetour("/Panama/brief", "?cur=usd")).toBe("/panama/brief?cur=usd");
    expect(briefDetour("/cotedivoire/brief/explore", "")).toBe("/cote-divoire/brief/explore");
    expect(briefDetour("/mn/Mongolia/brief", "")).toBe("/mn/mongolia/brief");
  });

  it("leave every address they are built under alone, and every other page", () => {
    expect(briefDetour("/panama/brief", "?docs=NDC")).toBeNull();
    expect(briefDetour("/es/panama/brief", "")).toBeNull();
    expect(briefDetour("/mn/mongolia/brief/contracts", "")).toBeNull();
    expect(briefDetour("/en/sri-lanka/brief/", "")).toBeNull();
    expect(briefDetour("/es/mongolia/findings", "")).toBeNull();
    expect(briefDetour("/es/analysis/abc", "")).toBeNull();
    expect(briefDetour("/es/nowhere/brief", "")).toBeNull();
  });
});
