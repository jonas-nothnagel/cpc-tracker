import mongolia from "@/data/geo/mongolia-aimags.json";
import type { GeoFile } from "./geo";

/** Outlines for the countries whose contracts can be placed on a map. */
export const GEO: Record<string, GeoFile> = {
  mongolia: mongolia as unknown as GeoFile,
};
