import type { PolicyDocumentType, Target } from "@/types";

/**
 * Normalize one raw payload target into the `Target` contract (a field
 * whitelist: a field not named here never reaches the UI), applying the
 * client-side locale swap for machine back-translations. Shared by
 * `useDashboardData` and the server-rendered finding and pulse pages, so every
 * surface applies the same field whitelist and swap rule without importing the
 * client dashboard bundle.
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
  // Locale swap for MACHINE back-translations only (the Mongolian targets):
  // there is no genuine source-language text to compare against, so the
  // machine text simply replaces the English under the global
  // machine-translation caveat on the language switcher, and the chip's
  // "original" would be redundant.
  //
  // Genuinely sourced originals (Panama's Spanish) are swapped SERVER-SIDE by
  // `src/lib/locale-text` instead, which keeps the English analysis text in
  // `textTranslation` so the language chip can still show both sides. Doing it
  // here as well would swap twice and, because this function whitelists the
  // fields it returns, would drop the English on the floor.
  if (
    locale &&
    language === locale &&
    textOriginal &&
    t.textOriginalSource === "machine"
  ) {
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
    // `activitySources` is the gate `itemisedActivities()` reads (viz/target-text):
    // without it a target's listed activities collapse into one paragraph and
    // "Activities & Actions (1)". `sources` feeds the document drawer's verbatim
    // quote and the public source links. Both are arrays the API already ships.
    activitySources: Array.isArray(t.activitySources) ? t.activitySources : undefined,
    sources: Array.isArray(t.sources) ? (t.sources as Target["sources"]) : undefined,
    textOriginal,
    sourceLabelOriginal,
    textOriginalSource:
      t.textOriginalSource === "machine" || t.textOriginalSource === "source"
        ? t.textOriginalSource
        : undefined,
    // Written server-side by src/lib/locale-text when the text was swapped onto
    // its source language: the English the analysis ran on, kept reachable
    // behind the language chip. This whitelist is why they must be listed —
    // anything not named here never reaches the UI.
    textTranslation: t.textTranslation ? String(t.textTranslation) : undefined,
    sourceLabelTranslation: t.sourceLabelTranslation
      ? String(t.sourceLabelTranslation)
      : undefined,
    textLocale: t.textLocale ? String(t.textLocale) : undefined,
    // Which elements the target's text states (src/.../target-quality).
    definition: (t.definition as Target["definition"]) ?? undefined,
    actionType:
      t.actionType === "mitigation" || t.actionType === "adaptation"
        ? t.actionType
        : undefined,
    ...extras,
  } as Target;
}
