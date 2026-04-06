/**
 * Converts the static Mongolia BER data into the pipeline-compatible BerData format.
 */

import type { BerData } from "@/types";
import {
  ENVIRONMENTAL_PROGRAMS,
  NON_ENVIRONMENTAL_PROGRAMS,
  ENVIRONMENTAL_PROGRAM_EXPENDITURE,
  NON_ENVIRONMENTAL_PROGRAM_EXPENDITURE,
  BER_KEY_FINDINGS,
} from "@/data/mongolia-ber-financing";

/** Build a BerData payload from the static Mongolia BER data. */
export function buildMongolianBerPayload(): BerData {
  const programs = [
    ...ENVIRONMENTAL_PROGRAMS.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      type: "environmental" as const,
    })),
    ...NON_ENVIRONMENTAL_PROGRAMS.map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      type: "non_environmental" as const,
    })),
  ];

  const expenditure = [
    ...ENVIRONMENTAL_PROGRAM_EXPENDITURE.map((e) => ({
      code: e.code,
      name: e.name,
      values: e.values,
    })),
    ...NON_ENVIRONMENTAL_PROGRAM_EXPENDITURE.map((e) => ({
      code: e.code,
      name: e.name,
      values: e.values,
    })),
  ];

  return {
    programs,
    expenditure,
    currency: BER_KEY_FINDINGS.currency,
    unit: "billion",
    period: { ...BER_KEY_FINDINGS.period },
    keyFindings: { ...BER_KEY_FINDINGS.nbsapFinancingGap },
  };
}
