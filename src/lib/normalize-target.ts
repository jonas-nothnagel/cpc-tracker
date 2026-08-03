import type { PolicyDocumentType, Target } from "@/types";

/**
 * Normalize one raw payload target into the `Target` contract, applying the
 * locale text swap: when the target's original-language text matches the
 * active locale, show it instead of the English translation. Extracted from
 * `CoherenceDashboard` so standalone surfaces (the finding pages) apply the
 * exact same rule without importing the dashboard bundle.
 */
export function normalizeTarget(t: Record<string, unknown>, locale?: string): Target {
  // Pseudo-target extras (`measureStatus` on BTR rows, `expenditure` on
  // BER rows) are not declared on the Target type, but the Atlas
  // signals layer reads them via a narrow cast to compute
  // quality-weighted backing. Passing them through here keeps the
  // data intact between the API and that consumer; anything that sees
  // them through the plain `Target` contract simply ignores them.
  const extras: Record<string, unknown> = {};
  if (t.measureStatus !== undefined) extras.measureStatus = t.measureStatus;
  if (t.expenditure !== undefined) extras.expenditure = t.expenditure;

  let text = String(t.text);
  let sourceLabel = String(t.sourceLabel);
  let textOriginal = t.textOriginal ? String(t.textOriginal) : undefined;
  let sourceLabelOriginal = t.sourceLabelOriginal
    ? String(t.sourceLabelOriginal)
    : undefined;
  const language = t.language ? String(t.language) : undefined;
  // When the target's original-language text matches the active locale, show
  // it instead of the English translation. For genuinely sourced originals
  // (textOriginalSource !== "machine") this is the real document wording; for
  // machine back-translations (e.g. the Mongolian targets) it surfaces the
  // machine text under the global machine-translation caveat on the language
  // switcher. Either way the chip's "original" is now redundant (already shown),
  // so drop it; the verify-translation chip is separately suppressed for
  // machine originals in OriginalLanguageChip.
  if (locale && language === locale && textOriginal) {
    text = textOriginal;
    if (sourceLabelOriginal) sourceLabel = sourceLabelOriginal;
    textOriginal = undefined;
    sourceLabelOriginal = undefined;
  }
  return {
    id: String(t.id),
    text,
    sourceDocument: t.sourceDocument as PolicyDocumentType,
    sourceLabel,
    country: String(t.country),
    isQuantitative: Boolean(t.isQuantitative),
    isTimeBound: Boolean(t.isTimeBound),
    quantitativeDetails: t.quantitativeDetails ? String(t.quantitativeDetails) : undefined,
    timeBoundDetails: t.timeBoundDetails ? String(t.timeBoundDetails) : undefined,
    activities: t.activities ? String(t.activities) : undefined,
    actions: t.actions ? String(t.actions) : undefined,
    textOriginal,
    sourceLabelOriginal,
    textOriginalSource:
      t.textOriginalSource === "machine" || t.textOriginalSource === "source"
        ? t.textOriginalSource
        : undefined,
    actionType:
      t.actionType === "mitigation" || t.actionType === "adaptation"
        ? t.actionType
        : undefined,
    ...extras,
  } as Target;
}
