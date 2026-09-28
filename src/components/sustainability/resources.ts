import type { FootprintMetrics } from "@/lib/footprint/types";

export type Resource = keyof FootprintMetrics;

/** The four resources in the order the page shows them. `suffix` follows an
 *  amount where its unit alone would not say what is measured. */
export const RESOURCES: {
  key: Resource;
  label: "carbon" | "electricity" | "water" | "minerals";
  suffix?: string;
}[] = [
  { key: "co2_geq", label: "carbon", suffix: "CO2e" },
  { key: "energy_wh", label: "electricity" },
  { key: "water_ml", label: "water" },
  { key: "minerals_ugsbeq", label: "minerals", suffix: "Sb-eq" },
];

export const resourceOf = (key: Resource) => RESOURCES.find((r) => r.key === key) ?? RESOURCES[0];
