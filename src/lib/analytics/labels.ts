import { ANALYTICS_LABEL_MAX, type ClickRole } from "./types";

/**
 * Derive a safe, short label for an auto-captured click. Pure string logic
 * (no DOM types) so the PII rules are unit-testable without a browser:
 * the provider passes in the candidate attribute/text values it read.
 *
 * Precedence: data-track > aria-label > visible text. Elements that contain
 * form controls must pass containsInput=true, which disables the text
 * fallback entirely — user-typed content can never become a label.
 */

export interface LabelSource {
  dataTrack?: string | null;
  ariaLabel?: string | null;
  /** textContent of the element; ignored when containsInput. */
  text?: string | null;
  /** True when the element is or contains input/textarea/select/contenteditable. */
  containsInput?: boolean;
}

export function sanitizeLabel(source: LabelSource): string | null {
  const candidate =
    clean(source.dataTrack) ??
    clean(source.ariaLabel) ??
    (source.containsInput ? null : clean(source.text));
  return candidate;
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const collapsed = value
    .replace(/\s+/g, " ")
    .trim()
    // Long digit runs are ids, phone numbers, or worse — never label material.
    .replace(/\d{7,}/g, "#")
    .slice(0, ANALYTICS_LABEL_MAX)
    .trim();
  return collapsed.length > 0 ? collapsed : null;
}

/** Coarse interaction role from tag name + ARIA role. */
export function clickRole(tagName: string, ariaRole: string | null): ClickRole {
  const tag = tagName.toLowerCase();
  const role = ariaRole?.toLowerCase() ?? null;
  if (role === "tab") return "tab";
  if (tag === "a") return "link";
  if (tag === "button" || role === "button") return "button";
  return "other";
}
