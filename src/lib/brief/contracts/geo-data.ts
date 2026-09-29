import mongolia from "@/data/geo/mongolia-aimags.json";
import type { GeoFile } from "./geo";

/** Outlines for the countries whose contracts can be placed on a map. The
 *  capital is too small an outline for its share of the money: it sits below
 *  the map, beside the contracts that name no single place. */
export const GEO: Record<string, GeoFile> = {
  mongolia: { ...(mongolia as unknown as GeoFile), band: ["MN-1"] },
};
