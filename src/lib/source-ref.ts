import type { SourceRef } from "@/types";

/**
 * Format a structured SourceRef into a single-line citation string like
 * "Mongolia BTR1 (December 2025), CTF-NDC Table 5 / PDF Table II.6, pp. 93-94".
 * Returns undefined when the ref is missing or empty so callers can fall back
 * to no citation rather than rendering an empty string.
 */
export function formatSourceRef(ref?: SourceRef): string | undefined {
  if (!ref) return undefined;
  const parts: string[] = [];
  if (ref.document) parts.push(ref.document);
  const detail: string[] = [];
  if (ref.section) detail.push(ref.section);
  if (ref.table) detail.push(ref.table);
  if (detail.length) parts.push(detail.join(" / "));
  if (ref.pages) parts.push(`pp. ${ref.pages}`);
  if (ref.annex) parts.push(ref.annex);
  return parts.length ? parts.join(", ") : undefined;
}
