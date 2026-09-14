import type { FootprintMetrics } from "./types";

/**
 * Everyday equivalences for the /sustainability totals. Illustrative scale
 * anchors, not measurements: each equivalent maps to exactly one base metric
 * (never blending energy-based and carbon-based framings), and every factor
 * traces to a stated source.
 *
 * Factor provenance (verified 2026-08-09):
 * - Petrol: US EPA greenhouse gas equivalencies calculator, 8,887 g CO2 per
 *   US gallon of gasoline (joint EPA/DOT 2010 factor) = 2,347.7 g per litre.
 *   NOTE: this is combustion (tailpipe) CO2 only, while the totals are
 *   EcoLogits life-cycle CO2e -- so the litre figure errs on the high side
 *   (never understates the footprint), and the copy says "burning" to keep
 *   the comparison honest.
 * - Electric car: long-range battery packs span roughly 75 to 100 kWh; we use
 *   the midpoint (87.5 kWh) and say "long-range" in the copy.
 * - Bathtub: a full tub holds roughly 155 litres.
 */
export const EQUIVALENCE_FACTORS = {
  /** g CO2e per litre of petrol (EPA 8,887 g/gallon / 3.78541 L/gallon). */
  petrolCo2GPerLitre: 8887 / 3.78541,
  /** Wh per full charge of a long-range electric car (75-100 kWh midpoint). */
  evChargeWh: 87_500,
  /** mL of water in a typical full bathtub. */
  bathtubMl: 155_000,
} as const;

export interface EverydayEquivalents {
  /** Litres of petrol whose combustion carries the same CO2e (carbon basis). */
  petrolLitres: number;
  /** Full charges of a long-range electric car (energy basis). */
  evCharges: number;
  /** Bathtubs of water (water basis). */
  bathtubs: number;
}

export function everydayEquivalents(
  totals: Pick<FootprintMetrics, "energy_wh" | "co2_geq" | "water_ml">,
): EverydayEquivalents {
  return {
    petrolLitres: totals.co2_geq / EQUIVALENCE_FACTORS.petrolCo2GPerLitre,
    evCharges: totals.energy_wh / EQUIVALENCE_FACTORS.evChargeWh,
    bathtubs: totals.water_ml / EQUIVALENCE_FACTORS.bathtubMl,
  };
}

/**
 * The equivalence strip is shown once the totals are large enough for the
 * anchors to be meaningful (roughly a tenth of the smallest anchor); below
 * that the raw units on the tiles communicate better than "0.01 bathtubs".
 */
export function equivalentsMeaningful(
  totals: Pick<FootprintMetrics, "energy_wh" | "co2_geq" | "water_ml">,
): boolean {
  const eq = everydayEquivalents(totals);
  return eq.petrolLitres >= 0.5 || eq.evCharges >= 0.1 || eq.bathtubs >= 0.25;
}
