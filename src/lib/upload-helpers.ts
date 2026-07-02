import type { PolicyDocumentType, TargetSource, TextCleanup } from "@/types";
import type { TargetRow } from "@/lib/csv-parser";
import type {
  ExtractionReviewItemOutcome,
  ExtractionReviewPostBody,
} from "@/lib/feedback/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CategoryItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isCustom: boolean;
}

interface BtrSummary {
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

export interface ExtractedActivity {
  text: string;
  sourceText?: string;
  section?: string;
  _quoteMatch?: TargetSource["_quoteMatch"];
}

/**
 * One target as returned by `/api/extract`, normalised to the canonical
 * corpus shape: `text` is the ENGLISH working text (machine-translated when
 * the source document is not English), `textOriginal` carries the verbatim
 * original-language wording. Provenance fields (`sources`, `textCleanup`,
 * `_provenanceFlag`) travel with the item all the way into the analysis.
 */
export interface ExtractedItem {
  text: string;
  label: string;
  sourceDocument: string;
  accepted: boolean;
  pageNumbers?: number[];
  /** ISO-639-1 code of the source document language; absent for English documents. */
  language?: string;
  textOriginal?: string;
  labelOriginal?: string;
  textOriginalSource?: "source" | "machine";
  sources?: TargetSource[];
  textCleanup?: TextCleanup;
  activities?: string;
  activitySources?: ExtractedActivity[];
  /** Validator note (unsourced claims or quotes not found in the document). */
  _provenanceFlag?: string;
  // Review-diff bookkeeping (extraction-review ledger only; never sent to
  // the analysis — extractedItemToTargetRow ignores these).
  /** Text as first shown to the reviewer, to detect edits. */
  initialText?: string;
  /** Label as first shown to the reviewer. */
  initialLabel?: string;
  /** True for targets the reviewer typed in by hand (recall-gap signal). */
  manuallyAdded?: boolean;
}

/** True for auto-generated labels like "Target 3" that carry no document numbering. */
export function isGenericLabel(label: string | undefined): boolean {
  return !label || /^target\s+\d+$/i.test(label.trim());
}

/**
 * Map an accepted extraction item to the target-table row shape, carrying
 * the full provenance contract. Document-provided labels are preserved
 * verbatim; the fallback label is used only when the extractor produced a
 * generic placeholder.
 */
export function extractedItemToTargetRow(
  item: ExtractedItem,
  fallbackLabel: string
): TargetRow {
  const label = isGenericLabel(item.label) ? fallbackLabel : item.label.trim();
  return {
    text: item.text,
    sourceDocument: item.sourceDocument as PolicyDocumentType,
    sourceLabel: label,
    source: "extraction",
    ...(item.activities ? { activities: item.activities } : {}),
    ...(item.textOriginal ? { textOriginal: item.textOriginal } : {}),
    ...(item.labelOriginal ? { sourceLabelOriginal: item.labelOriginal } : {}),
    ...(item.language ? { language: item.language } : {}),
    ...(item.textOriginalSource
      ? { textOriginalSource: item.textOriginalSource }
      : {}),
    ...(item.sources?.length ? { sources: item.sources } : {}),
    ...(item.textCleanup ? { textCleanup: item.textCleanup } : {}),
    ...(item.pageNumbers?.length ? { pageNumbers: item.pageNumbers } : {}),
    ...(item._provenanceFlag ? { _provenanceFlag: item._provenanceFlag } : {}),
  };
}

export type BtrData = Record<string, unknown>;

// ─── Constants ───────────────────────────────────────────────────────────────

export const MAX_TARGETS = 150;
export const TARGETS_PREVIEW = 5;
export const COST_PER_CALL = 0.00015;
export const GLOBE_CATEGORIES_COUNT = 9;

export const DOCUMENT_TYPES: { value: PolicyDocumentType; label: string; hint?: string }[] = [
  { value: "NDC", label: "NDC (Nationally Determined Contributions)" },
  { value: "NBSAP", label: "NBSAP / National Biodiversity Targets" },
  { value: "NAP", label: "NAP (National Adaptation Plan)" },
  { value: "LDN", label: "LDN (Land Degradation Neutrality)" },
  { value: "SECTORAL", label: "Sectoral Policy", hint: "e.g. Agriculture, Transport, Energy" },
  { value: "OTHER", label: "Other Document" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build the extraction-review ledger event from the reviewer's final item
 * states. Pure so it is unit-testable; the wizard POSTs the result to
 * /api/extraction-review fire-and-forget. Reviewer corrections are the
 * production learning signal: removals expose precision problems, edits
 * expose phrasing problems, manual additions expose recall gaps.
 */
export function buildExtractionReviewEvent(
  items: ExtractedItem[],
  meta: {
    countryRaw: string;
    fileName: string;
    docType: string;
    outcome: "accepted" | "discarded";
    clientId: string;
    locale: string;
  }
): ExtractionReviewPostBody {
  const outcomes: ExtractionReviewItemOutcome[] = [];
  const counts = { extracted: 0, kept: 0, edited: 0, removed: 0, added: 0 };
  for (const item of items) {
    if (!item.manuallyAdded) counts.extracted += 1;
    if (item.manuallyAdded) {
      // Added-then-unchecked items are noise, not signal.
      if (!item.accepted) continue;
      counts.added += 1;
      outcomes.push({
        action: "added",
        label: item.label,
        textAfter: item.text,
      });
      continue;
    }
    const base = {
      label: item.initialLabel ?? item.label,
      textBefore: item.initialText ?? item.text,
      ...(item.textCleanup ? { textCleanup: item.textCleanup } : {}),
      ...(item._provenanceFlag ? { hadProvenanceFlag: true } : {}),
    };
    if (!item.accepted || meta.outcome === "discarded") {
      counts.removed += 1;
      outcomes.push({ action: "removed", ...base });
    } else if (
      item.text !== (item.initialText ?? item.text) ||
      item.label !== (item.initialLabel ?? item.label)
    ) {
      counts.edited += 1;
      outcomes.push({ action: "edited", ...base, textAfter: item.text });
    } else {
      counts.kept += 1;
      outcomes.push({ action: "kept", ...base });
    }
  }
  return {
    countryRaw: meta.countryRaw,
    fileName: meta.fileName,
    docType: meta.docType,
    outcome: meta.outcome,
    counts,
    items: outcomes,
    clientId: meta.clientId,
    locale: meta.locale,
  };
}

/** POST the review event; failures only log (never block the review flow). */
export function submitExtractionReview(body: ExtractionReviewPostBody): void {
  fetch("/api/extraction-review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((err) => console.warn("extraction-review submit failed:", err));
}

/** Check if an Excel file looks like a BTR/CTF file based on its name. */
export function isBtrExcel(fileName: string): boolean {
  return /btr|ctf|btf/i.test(fileName);
}

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
