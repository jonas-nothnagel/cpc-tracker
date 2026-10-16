import { describe, expect, it } from "vitest";
import { GEO, geoFor } from "./geo-data";

describe("the contracts map's places", () => {
  it("names Mongolia's aimags and capital in Mongolian on the Mongolian page", () => {
    const mn = geoFor("mongolia", "mn")!;
    expect(mn.features.map((f) => f.code)).toEqual(GEO.mongolia.features.map((f) => f.code));
    expect(mn.features.filter((f) => !/\p{Script=Cyrillic}/u.test(f.name)).map((f) => f.code)).toEqual([]);
    expect(mn.features.find((f) => f.code === "MN-1")!.name).toBe("Улаанбаатар");
    expect(mn.features.find((f) => f.code === "MN-065")!.name).toBe("Говь-Алтай");
    expect(mn.band).toEqual(["MN-1"]);
  });

  it("keeps the English names elsewhere", () => {
    expect(geoFor("mongolia", "en")).toBe(GEO.mongolia);
    expect(geoFor("mongolia", "es")).toBe(GEO.mongolia);
  });

  it("has no map for a country without one", () => {
    expect(geoFor("panama", "es")).toBeNull();
  });
});
