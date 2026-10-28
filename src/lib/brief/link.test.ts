import { describe, expect, it } from "vitest";
import { firstParam, linkParams } from "./link";

describe("a page's link", () => {
  it("reads every parameter, a repeated one with all its values", () => {
    expect(linkParams("?docs=NDC%2CNBSAP&layers=budget&layers=mitigation&cur=usd")).toEqual({
      docs: "NDC,NBSAP",
      layers: ["budget", "mitigation"],
      cur: "usd",
    });
    expect(linkParams("")).toEqual({});
  });

  it("takes the first value where one is wanted", () => {
    expect(firstParam(["usd", "mnt"])).toBe("usd");
    expect(firstParam("usd")).toBe("usd");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
