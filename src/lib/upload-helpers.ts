import type { PolicyDocumentType } from "@/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CategoryItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isCustom: boolean;
}

export interface BtrSummary {
  mitigationMeasures: number;
  sectorEmissions: number;
  projections: number;
  technologySupport: number;
  capacityBuilding: number;
}

export interface UploadedDoc {
  id: string;
  fileName: string;
  fileType: "targets" | "btr";
  status: "parsing" | "ready" | "error";
  error?: string;
  targetCount?: number;
  docTypeCounts?: Record<string, number>;
  btrSummary?: BtrSummary;
}

export interface ExtractedItem {
  text: string;
  label: string;
  sourceDocument: string;
  accepted: boolean;
  pageNumbers?: number[];
  language?: string;
  text_eng?: string;
  label_eng?: string;
}

export type BtrData = Record<string, unknown>;

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_TARGETS = 150;
export const TARGETS_PREVIEW = 5;
export const COST_PER_CALL = 0.00015;
export const CROSS_CUTTING_THEMES_COUNT = 11;

export const DOCUMENT_TYPES: { value: PolicyDocumentType; label: string; hint?: string }[] = [
  { value: "NDC", label: "NDC (Nationally Determined Contributions)" },
  { value: "NBSAP", label: "NBSAP / National Biodiversity Targets" },
  { value: "NAP", label: "NAP (National Adaptation Plan)" },
  { value: "LDN", label: "LDN (Land Degradation Neutrality)" },
  { value: "SECTORAL", label: "Sectoral Policy", hint: "e.g. Agriculture, Transport, Energy" },
  { value: "OTHER", label: "Other Document" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Detect whether an Excel BTR file is an FTC-Support or NDC file from its name. */
export function detectBtrType(fileName: string): "support" | "ndc" {
  return /ftc|support/i.test(fileName) ? "support" : "ndc";
}

/**
 * Merge two BTR data objects. Arrays are concatenated; sectorEmissions uses
 * whichever has actual data; scalar fields prefer the second value.
 */
export function mergeBtrData(existing: BtrData | null, incoming: BtrData): BtrData {
  if (!existing) return incoming;

  const mergeArr = (a: unknown, b: unknown): unknown[] =>
    [...((a as unknown[]) ?? []), ...((b as unknown[]) ?? [])];

  const existingEmissions = existing.sectorEmissions as { bySector: unknown[] } | undefined;
  const incomingEmissions = incoming.sectorEmissions as { bySector: unknown[] } | undefined;
  const aSectors = existingEmissions?.bySector ?? [];
  const bSectors = incomingEmissions?.bySector ?? [];

  return {
    sourceFile: [existing.sourceFile, incoming.sourceFile].filter(Boolean).join(", "),
    progressIndicators: mergeArr(existing.progressIndicators, incoming.progressIndicators),
    mitigationMeasures: mergeArr(existing.mitigationMeasures, incoming.mitigationMeasures),
    sectorEmissions: { bySector: aSectors.length > 0 ? aSectors : bSectors },
    projections: mergeArr(existing.projections, incoming.projections),
    technologySupport: mergeArr(existing.technologySupport, incoming.technologySupport),
    capacityBuilding: mergeArr(existing.capacityBuilding, incoming.capacityBuilding),
  };
}
