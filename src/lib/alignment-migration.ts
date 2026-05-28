/**
 * Load-time migration from v1 alignment records to v2.1 schema.
 *
 * Mirrors `python/src/alignment_schema.py::migrate_legacy_record`. Keeps the
 * TypeScript loader compatible with any alignment.json that pre-dates v2.1
 * (e.g. files still on `main`, or hand-curated fixtures).
 *
 * v1 records have:
 *   { alignment: "possible_misalignment" | "possible_conflict" | "likely_conflict",
 *     contradictionType?: "goal_conflict" | "resource_competition" | "implementation_tension" | "scale_scope_mismatch",
 *     description: string }
 *
 * v2.1 records have:
 *   { alignment: "flagged",
 *     mechanism: "goal_conflict" | "resource_competition" | "delivery_friction",
 *     manageability: "manageable" | "fundamental",
 *     confidence: "low" | "medium" | "high",
 *     description: string }
 *
 * Positive-side levels ("none" / "low" / "medium" / "high") pass through unchanged.
 */

import type {
  AlignmentConfidence,
  AlignmentManageability,
  AlignmentMechanism,
  AlignmentResult,
} from "@/types";

const LEGACY_LEVEL_TO_FIELDS: Record<
  string,
  { manageability: AlignmentManageability; confidence: AlignmentConfidence }
> = {
  possible_misalignment: { manageability: "manageable", confidence: "medium" },
  possible_conflict: { manageability: "fundamental", confidence: "medium" },
  likely_conflict: { manageability: "fundamental", confidence: "high" },
};

const LEGACY_TYPE_TO_MECHANISM: Record<string, AlignmentMechanism> = {
  implementation_tension: "delivery_friction",
  resource_competition: "resource_competition",
  goal_conflict: "goal_conflict",
  scale_scope_mismatch: "delivery_friction",
};

/**
 * Convert a single record. Tolerant of unknown shapes; returns the record
 * unchanged if it does not look legacy.
 */
export function migrateLegacyAlignmentRecord(
  record: Record<string, unknown>,
): AlignmentResult {
  const level = record.alignment as string | undefined;

  // Already v2.1 or positive-side — pass through.
  if (!level || !(level in LEGACY_LEVEL_TO_FIELDS)) {
    return record as unknown as AlignmentResult;
  }

  const defaults = LEGACY_LEVEL_TO_FIELDS[level];
  const legacyType = record.contradictionType as string | undefined;
  const mechanism: AlignmentMechanism =
    (legacyType && LEGACY_TYPE_TO_MECHANISM[legacyType]) || "delivery_friction";

  const migrated = {
    ...record,
    targetAId: String(record.targetAId ?? ""),
    targetBId: String(record.targetBId ?? ""),
    description: String(record.description ?? ""),
    alignment: "flagged" as const,
    mechanism,
    manageability: defaults.manageability,
    confidence: defaults.confidence,
  };
  // Strip the v1 field once we've absorbed it.
  delete (migrated as Record<string, unknown>).contradictionType;
  return migrated as unknown as AlignmentResult;
}

/** Apply the migration to a whole alignment.json array. */
export function migrateLegacyAlignmentRecords(
  records: Array<Record<string, unknown>>,
): AlignmentResult[] {
  return records.map(migrateLegacyAlignmentRecord);
}
