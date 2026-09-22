/**
 * Source-language target text (removable system — see README.md).
 *
 * WHY THIS EXISTS: Panama's 368 targets were written in Spanish and machine-
 * translated to English so the pipeline could analyse one language. The
 * dashboard then rendered that English translation to everyone, including on
 * `/es/panama` — so Panamanian officials read their own national commitments
 * back in machine English. The focal-group report (23 Jul 2026) asked for
 * "linguistic consistency in the Spanish version by correcting content that is
 * still in English"; this is the largest single piece of that.
 *
 * WHAT IT DOES: when the requested locale matches a target's source language,
 * the text the UI renders becomes the ORIGINAL, and the English analysis text
 * moves to `textTranslation` so it stays one click away behind the existing
 * language chip. The swap happens once, at the data layer, so every surface
 * that renders a target gets it without a change of its own.
 *
 * WHAT IT DOES NOT DO: it does not touch `alignment[].description` (the pair
 * rationales — those are translated separately), and it does not re-run any
 * analysis. The verdicts were computed on the English text and are unchanged;
 * only which string is shown changes.
 *
 * KNOWN DEGRADATION: `quantitativeDetails` / `timeBoundDetails` hold phrases
 * extracted from the ENGLISH text, and `TargetTextWithHighlights` locates them
 * by substring. Against swapped Spanish text those lookups simply miss, and
 * that component already falls back to rendering plain text, so the highlight
 * is lost rather than the sentence. Re-extracting the phrases per language is
 * follow-up pipeline work, not a blocker on showing people their own words.
 */

/** The subset of a target this module reads and writes. */
export interface LocalizableTarget {
  text?: string;
  /** The source-language text, as curated. */
  textOriginal?: string;
  /** ISO-639-1 code of `textOriginal`, set by the ingest step. */
  language?: string;
  /** Set when `textOriginal` is itself a machine back-translation rather than
   *  genuine source text — never treat that as an original worth showing. */
  textOriginalSource?: string;
  /** The target's label within its document, in English. */
  sourceLabel?: string;
  /** That label as written in the source document. */
  sourceLabelOriginal?: string;
  /** Written by this module: the English text that `text` used to hold. */
  textTranslation?: string;
  /** Written by this module: the English label that `sourceLabel` used to hold. */
  sourceLabelTranslation?: string;
  /** Written by this module: the language `text` is now in. */
  textLocale?: string;
}

/**
 * True when `target` should render in its own language for `locale`.
 *
 * Requires a real source-language string: a target whose `textOriginal` is a
 * machine back-translation, is missing, or is identical to the English carries
 * nothing worth swapping in.
 */
export function shouldUseOriginal(
  target: LocalizableTarget,
  locale: string | undefined,
): boolean {
  if (!locale || locale === "en") return false;
  if (!target.textOriginal || !target.text) return false;
  if (target.textOriginalSource === "machine") return false;
  if (target.textOriginal === target.text) return false;
  return target.language?.toLowerCase() === locale.toLowerCase();
}

/**
 * Swap one target onto its source language. Returns the target unchanged (same
 * reference) when it should not be swapped, so callers can map over a whole
 * corpus cheaply and countries with no translated text pay nothing.
 */
export function localizeTargetText<T extends LocalizableTarget>(
  target: T,
  locale: string | undefined,
): T {
  if (!shouldUseOriginal(target, locale)) return target;
  const swapped: T = {
    ...target,
    text: target.textOriginal,
    textTranslation: target.text,
    textLocale: target.language,
  };
  // The label the target carries inside its document ("1.3 Acciones para
  // implementar…") reads as English in the Spanish UI for exactly the same
  // reason the text does, so it swaps on the same condition — but only when a
  // source-language label was actually curated.
  if (target.sourceLabelOriginal && target.sourceLabel) {
    swapped.sourceLabel = target.sourceLabelOriginal;
    swapped.sourceLabelTranslation = target.sourceLabel;
  }
  return swapped;
}

/** `localizeTargetText` over a list. Returns the same array when nothing
 *  changed, so an untranslated country keeps object identity throughout. */
export function localizeTargetTexts<T extends LocalizableTarget>(
  targets: T[],
  locale: string | undefined,
): T[] {
  if (!locale || locale === "en") return targets;
  let changed = false;
  const next = targets.map((t) => {
    const localized = localizeTargetText(t, locale);
    if (localized !== t) changed = true;
    return localized;
  });
  return changed ? next : targets;
}

/** Any config entry that carries per-locale display overrides. */
interface LabelledEntry {
  labels?: Record<string, Record<string, string | undefined>>;
  [key: string]: unknown;
}

/**
 * Fold each entry's `labels[locale]` overrides onto its base fields.
 *
 * Used for document types (mediumLabel / docKind / objective) and for the
 * coverage-gap notes, which are country-specific sourced prose declared in the
 * same config and would otherwise read as English on a translated page for
 * exactly the same reason the document labels did.
 *
 * Applied at the data layer for the same reason as the target-text swap: every
 * `getDocMediumLabel` / `getDocMeta` call site then works unchanged, and the
 * whole behaviour is one call rather than a locale argument threaded through
 * a dozen helpers.
 *
 * A locale with no overrides, or a country that declares no `labels` at all,
 * comes back untouched — including the same object identity, so nothing
 * re-renders that did not need to.
 */
export function localizeLabelled<T extends LabelledEntry>(
  documentTypes: T[],
  locale: string | undefined,
): T[] {
  if (!locale || locale === "en") return documentTypes;
  let changed = false;
  const next = documentTypes.map((entry) => {
    const overrides = entry.labels?.[locale];
    if (!overrides) return entry;
    // Drop empty overrides so a blank string cannot erase a sourced English
    // label — an absent translation must fall back, not blank the field.
    const applied = Object.fromEntries(
      Object.entries(overrides).filter(([, v]) => typeof v === "string" && v.length > 0),
    );
    if (Object.keys(applied).length === 0) return entry;
    changed = true;
    return { ...entry, ...applied };
  });
  return changed ? next : documentTypes;
}

// ─── Pair rationales ────────────────────────────────────────────────────────

/**
 * A sparse per-locale rationale overlay, written by
 * `python/scripts/translate_alignment.py` as `alignment.<locale>.json`.
 *
 * Sparse on purpose: `alignment.json` is ~28 MB for Panama and only the
 * analytically salient verdicts are translated by default, so the overlay maps
 * `targetAId::targetBId` to a translated rationale and says nothing about the
 * rest.
 */
export interface AlignmentTranslationOverlay {
  descriptions?: Record<string, string>;
  _meta?: Record<string, unknown>;
}

export interface TranslatableAlignment {
  targetAId?: string;
  targetBId?: string;
  description?: string;
  /** Written here: the rationale is still English because this pair was not
   *  part of the translation pass. Drives the disclosure in the pair drawer —
   *  a reader must never be left to guess why one rationale is in English. */
  descriptionTranslationPending?: boolean;
}

/**
 * Merge a rationale overlay onto alignment records.
 *
 * Pairs present in the overlay get the translated rationale. Pairs absent from
 * it keep the English one and are marked pending, so the gap is disclosed
 * rather than silently mixed in. With no overlay at all nothing is marked:
 * a country with no translation pass reads exactly as it does today, in one
 * consistent language, with nothing to explain.
 *
 * Keys are matched in both directions because pair identity is unordered
 * elsewhere in the codebase (see `computeModelAgreement`), and a rationale
 * describes the relationship rather than one side of it.
 */
export function applyAlignmentTranslations<T extends TranslatableAlignment>(
  records: T[],
  overlay: AlignmentTranslationOverlay | null | undefined,
  locale: string | undefined,
): T[] {
  const descriptions = overlay?.descriptions;
  if (!locale || locale === "en" || !descriptions) return records;
  return records.map((r) => {
    if (typeof r.description !== "string" || !r.description) return r;
    const translated =
      descriptions[`${r.targetAId}::${r.targetBId}`] ??
      descriptions[`${r.targetBId}::${r.targetAId}`];
    if (translated) return { ...r, description: translated };
    return { ...r, descriptionTranslationPending: true };
  });
}
